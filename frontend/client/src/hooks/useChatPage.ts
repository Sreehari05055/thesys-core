import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  formatUploadStatusMessage,
  mergeIngestedFiles,
  normalizeIngestedFiles,
  fetchSessionIngestedFiles,
  fetchAllIngestedFiles,
  downloadIngestedFile,
  type IngestedFile,
} from "@/lib/ingestedFile";
import { fetchBatchCitations, fetchCitations, exportCitations } from "@/lib/citation";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/apiFetch";
import {
  normalizeDocumentSummaryFromApi,
  normalizeDocumentSummaryFromSummariesEvent,
  type DocumentSummary,
} from "@/lib/documentSummary";
import type { SavedSummaryMeta } from "@/lib/summaryList";
import {
  activeDocumentsFromIngested,
  pruneSelectedDocIds,
  scopedActiveDocumentsForMessage,
  toggleDocIdInList,
  type ActiveDocument,
} from "@/lib/chatDocScope";
import type { ChatMessage, Source } from "@/lib/chatMessages";
import { storeReaderHighlight } from "@/lib/readerHighlightStorage";
import { sourceJumpTarget } from "@/lib/sourceHighlight";
import { CHAT_STREAM_ERROR, getApiErrorMessage } from "@/lib/apiErrors";
import {
  buildChatPostBody,
  chatQuestionText,
  fetchConversation,
  mergeLoadedConversationMessages,
  streamingTurnMessages,
} from "@/lib/conversationApi";
import { buildConversationSourceIndex, collectCitedConversationSources, appendPendingChatSource, normalizeChatSources, updateLastBotMessage } from "@/lib/chatMessages";
import { consumeChatSseStream } from "@/lib/chatStream";
import { preserveScrollPosition, scrollChatToBottom } from "@/lib/chatScroll";
import type { RightPanelTab } from "@/types/chat";
import { getDocDisplayName, getDocId } from "@/lib/sourceDoc";
import {
  bumpChatLastAccess,
  isDefaultSessionTitle,
  loadActiveChatId,
  loadChats,
  parseOptionalIsoToMs,
  saveActiveChatId,
  saveChats,
  sortChatsByRecent,
} from "@/lib/chatStorage";
import type {
  Chat,
  CitationDialogData,
  CitationExportFormat,
  ConversationSummary,
} from "@/types/chat";
import { API_URLS } from "@/config";
import type { ResearchScope } from "@/lib/researchScope";
import {
  normalizeExternalPapers,
  primaryExternalLink,
  type ExternalPaper,
} from "@/lib/externalPaper";

export function useChatPage() {
  // ── Multi-chat state ──
  const [chats, setChats] = useState<Chat[]>(() => sortChatsByRecent(loadChats()));
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    const loaded = sortChatsByRecent(loadChats());
    const stored = loadActiveChatId();
    if (stored && loaded.some((c) => c.id === stored)) return stored;
    return loaded.length > 0 ? loaded[0].id : null;
  });

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const activeSessionId = activeChat?.sessionId ?? null;
  const messages = activeChat?.messages ?? [];

  // ── Input & loading ──
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  // ── Ingested files (files uploaded to backend) ──
  const [ingestedFiles, setIngestedFiles] = useState<IngestedFile[]>([]);
  const [ingestedFilesLoading, setIngestedFilesLoading] = useState(false);
  const [libraryFiles, setLibraryFiles] = useState<IngestedFile[]>([]);
  const [libraryFilesLoading, setLibraryFilesLoading] = useState(false);
  const [sidebarView, setSidebarView] = useState<"session" | "library">("session");
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [citeLibraryLoading, setCiteLibraryLoading] = useState(false);
  const [exportLibraryLoading, setExportLibraryLoading] = useState<CitationExportFormat | null>(null);

  // ── Source intelligence ──
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [activeExternalPaper, setActiveExternalPaper] = useState<ExternalPaper | null>(null);
  const [addingExternalPaperId, setAddingExternalPaperId] = useState<string | null>(null);
  const [pendingSourceRefs, setPendingSourceRefs] = useState<Source[]>([]);
  const [showRightPanel, setShowRightPanelState] = useState(false);
  const [showPDF, setShowPDF] = useState(false);
  const [rightPanelTab, setRightPanelTabState] = useState<RightPanelTab>("sources");
  const [leftPanelMode, setLeftPanelMode] = useState<"chat" | "summary">("chat");
  const [activeSummaryTitle, setActiveSummaryTitle] = useState("");
  const [activeSummaryId, setActiveSummaryId] = useState<string | null>(null);
  const [summariesRefreshKey, setSummariesRefreshKey] = useState(0);
  const [loadingSavedSummaryId, setLoadingSavedSummaryId] = useState<string | null>(null);
  const [selectedChatDocIds, setSelectedChatDocIds] = useState<string[]>([]);
  const [researchScopeByChat, setResearchScopeByChat] = useState<Record<string, ResearchScope>>({});
  const [citationData, setCitationData] = useState<CitationDialogData | null>(null);

  const rawScope =
    activeChatId && researchScopeByChat[activeChatId]
      ? researchScopeByChat[activeChatId]
      : "library";
  const researchScope: ResearchScope = rawScope === "discover" ? "discover" : "library";

  const [documentSummary, setDocumentSummary] = useState<DocumentSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ── Deleted/tombstoned source IDs (chat-scoped) ──
  // When a RAG file is deleted, the backend returns `deleted_chunk_ids`.
  // We keep them here so historical messages render those references gracefully.
  const [deletedSourceIdsByChat, setDeletedSourceIdsByChat] = useState<Record<string, string[]>>({});
  const [sourcesIndexReadyByChat, setSourcesIndexReadyByChat] = useState<Record<string, boolean>>({});
  const deletedSourceIds = useMemo(() => {
    if (!activeChatId) return new Set<string>();
    return new Set<string>(deletedSourceIdsByChat[activeChatId] ?? []);
  }, [activeChatId, deletedSourceIdsByChat]);
  const sourcesIndexReady = activeChatId ? Boolean(sourcesIndexReadyByChat[activeChatId]) : false;

  // LLM-cited source IDs shown in the Sources panel (not every backend retrieval).
  const panelSources = useMemo(
    () => collectCitedConversationSources(messages),
    [messages],
  );
  const { knownSourceIds, allSourcesById, globalSourceNumberById } = useMemo(
    () => buildConversationSourceIndex(messages),
    [messages],
  );

  const selectedChatDocs = useMemo(
    () => activeDocumentsFromIngested(ingestedFiles, selectedChatDocIds),
    [ingestedFiles, selectedChatDocIds],
  );

  // ── Sidebar ──
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // ── Refs ──
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  const setShowRightPanel = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      preserveScrollPosition(chatWindowRef.current, () => setShowRightPanelState(value));
    },
    [],
  );

  const setRightPanelTab = useCallback((tab: RightPanelTab) => {
    setRightPanelTabState(tab);
  }, []);

  const openRightPanel = useCallback((tab: RightPanelTab = "sources") => {
    preserveScrollPosition(chatWindowRef.current, () => {
      setShowRightPanelState(true);
      setRightPanelTabState(tab);
    });
  }, []);

  const selectSourceForPreview = useCallback(
    (src: Source, opts?: { showPdf?: boolean }) => {
      setActiveExternalPaper(null);
      setActiveSource(src);
      openRightPanel("sources");
      if (opts?.showPdf) setShowPDF(true);
    },
    [openRightPanel],
  );

  const selectExternalPaperForPreview = useCallback(
    (paper: ExternalPaper) => {
      setActiveSource(null);
      setShowPDF(false);
      setActiveExternalPaper(paper);
      openRightPanel("sources");
    },
    [openRightPanel],
  );

  const openExternalPaperLink = useCallback((paper: ExternalPaper) => {
    const url = primaryExternalLink(paper);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  // ── Persist chats ──
  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  useEffect(() => {
    saveActiveChatId(activeChatId);
  }, [activeChatId]);

  // ── Initialize sidebar chats from backend sessions ──
  useEffect(() => {
    let cancelled = false;

    const loadSessions = async () => {
      try {
        const res = await apiFetch(API_URLS.listConversations);
        if (!res.ok) return;

        const data = await res.json();
        const sessions: ConversationSummary[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.sessions)
            ? data.sessions
            : Array.isArray(data?.conversations)
              ? data.conversations
              : [];

        if (cancelled || sessions.length === 0) return;

        setChats((prev) => {
          const prevBySession = new Map(prev.map((c) => [c.sessionId, c]));
          const seenSessionIds = new Set<string>();

          const mapped = sessions
            .map((session): Chat | null => {
              const resolvedSessionId =
                session.session_id || session.sessionId || session.id || "";
              const sessionId =
                typeof resolvedSessionId === "string" ? resolvedSessionId.trim() : "";
              if (!sessionId || seenSessionIds.has(sessionId)) return null;
              seenSessionIds.add(sessionId);

              const existing = prevBySession.get(sessionId);
              const apiLastAccess = parseOptionalIsoToMs(
                session.last_access || session.lastAccess,
              );
              const apiCreatedAt = parseOptionalIsoToMs(
                session.created_at || session.createdAt,
              );
              const apiTitle =
                typeof session.title === "string" && session.title.trim()
                  ? session.title.trim()
                  : null;
              const staleLocalTitle =
                existing?.title && isDefaultSessionTitle(existing.title);

              return {
                id: existing?.id ?? sessionId,
                sessionId,
                title:
                  apiTitle ??
                  (existing && !staleLocalTitle && existing.title ? existing.title : "New session"),
                messages: existing?.messages ?? [],
                lastAccessAt: apiLastAccess ?? existing?.lastAccessAt,
                createdAt: apiCreatedAt ?? existing?.createdAt ?? Date.now(),
              };
            })
            .filter((chat): chat is Chat => chat !== null);

          if (mapped.length === 0) return prev;

          const apiSessionIds = new Set(mapped.map((c) => c.sessionId));
          const localOnly = prev.filter((c) => !apiSessionIds.has(c.sessionId));
          const merged = sortChatsByRecent([...mapped, ...localOnly]);

          setActiveChatId((prevActive) => {
            if (prevActive && merged.some((c) => c.id === prevActive)) return prevActive;
            return merged[0]?.id ?? null;
          });

          return merged;
        });
      } catch {
        // ignore session list load errors
      }
    };

    loadSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Close menu on outside click ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    if (menuOpenId) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenId]);

  const scrollToBottom = useCallback(() => {
    scrollChatToBottom(chatWindowRef.current);
  }, []);

  const resolveDocId = useCallback(
    (source: Source) => getDocId(source, ingestedFiles),
    [ingestedFiles],
  );

  // ── Chat CRUD ──
  const switchChat = useCallback((chatId: string) => {
    setSidebarView("session");
    setActiveChatId(chatId);
    setChats((prev) => bumpChatLastAccess(prev, chatId));
    setActiveSource(null);
    setActiveExternalPaper(null);
    setShowPDF(false);
    setUploadMessage(null);
    setInput("");
    setLeftPanelMode("chat");
    setDocumentSummary(null);
    setSummaryLoading(false);
    setActiveSummaryTitle("");
    setActiveSummaryId(null);
    setSelectedChatDocIds([]);
  }, []);

  const createNewChat = useCallback(async () => {
    let sessionId: string;
    try {
      const res = await apiFetch(API_URLS.newConversation, { method: "POST" });
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const data = await res.json();
      const id = data.session_id ?? data.sessionId;
      if (typeof id !== "string" || !id.trim()) throw new Error("Invalid session_id");
      sessionId = id.trim();
    } catch (err) {
      console.error("[createNewChat] /api/conversations/new failed — falling back to local UUID:", err);
      sessionId = crypto.randomUUID();
    }

    const newChat: Chat = {
      id: sessionId,
      title: "New session",
      messages: [],
      createdAt: Date.now(),
      lastAccessAt: Date.now(),
      sessionId,
    };

    setChats((prev) => sortChatsByRecent([newChat, ...prev]));
    setSidebarView("session");
    setActiveChatId(sessionId);
    setActiveSource(null);
    setActiveExternalPaper(null);
    setShowRightPanel(false);
    setShowPDF(false);
    setUploadMessage(null);
    setInput("");
    setLeftPanelMode("chat");
    setDocumentSummary(null);
    setSummaryLoading(false);
    setActiveSummaryTitle("");
    setActiveSummaryId(null);
    setSelectedChatDocIds([]);
  }, []);


  const deleteChat = useCallback(
    (chatId: string) => {
      const chatToDelete = chats.find((c) => c.id === chatId);
      if (!chatToDelete) return;

      // Call backend to delete conversation
      apiFetch(API_URLS.deleteConversation, { method: "DELETE" }, chatToDelete.sessionId).catch(() => {
        // ignore delete errors—proceed with local deletion anyway
      });

      setChats((prev) => {
        const updated = prev.filter((c) => c.id !== chatId);
        if (activeChatId === chatId) {
          const next = updated.length > 0 ? updated[0].id : null;
          setActiveChatId(next);
          if (!next) {
            setActiveSource(null);
            setShowRightPanel(false);
          }
        }
        return updated;
      });
      setMenuOpenId(null);
    },
    [activeChatId, chats],
  );

  const toggleChatDocSelection = useCallback((docId: string) => {
    setSelectedChatDocIds((prev) => toggleDocIdInList(prev, docId));
    setLeftPanelMode("chat");
  }, []);

  useEffect(() => {
    setSelectedChatDocIds((prev) => {
      const pruned = pruneSelectedDocIds(prev, ingestedFiles);
      if (pruned.length === prev.length && pruned.every((id, i) => id === prev[i])) return prev;
      return pruned;
    });
  }, [ingestedFiles]);

  // ── Helper to update messages of the active chat ──
  const setMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== activeChatId) return c;
          const newMessages = updater(c.messages);
          return { ...c, messages: newMessages };
        }),
      );
    },
    [activeChatId],
  );

  const exitSummaryView = useCallback(() => {
    const summarySourceIds = new Set(documentSummary?.sources.map((s) => s.id) ?? []);

    setLeftPanelMode("chat");
    setDocumentSummary(null);
    setSummaryLoading(false);
    setActiveSummaryTitle("");
    setActiveSummaryId(null);

    let clearPreview = false;
    setActiveSource((prev) => {
      if (prev !== null && summarySourceIds.has(prev.id)) {
        clearPreview = true;
        return null;
      }
      return prev;
    });
    if (clearPreview) {
      setShowPDF(false);
    }
  }, [documentSummary]);

  const attachSourceForChat = useCallback((src: Source) => {
    setPendingSourceRefs((prev) => appendPendingChatSource(prev, src));
    setLeftPanelMode("chat");
    requestAnimationFrame(() => chatInputRef.current?.focus());
  }, []);

  const openSummaryView = useCallback(
    (title: string, summaryId: string | null = null, rightTab: RightPanelTab = "sources") => {
      preserveScrollPosition(chatWindowRef.current, () => {
        setActiveSummaryTitle(title);
        setActiveSummaryId(summaryId);
        setLeftPanelMode("summary");
        setShowRightPanelState(true);
        setRightPanelTabState(rightTab);
        setShowPDF(false);
        setActiveSource(null);
      });
    },
    [],
  );

  const loadSavedSummary = useCallback(
    async (meta: SavedSummaryMeta) => {
      if (!activeSessionId) return;
      setLoadingSavedSummaryId(meta.id);
      setSummaryLoading(true);
      setDocumentSummary(null);
      openSummaryView(meta.title || meta.filename || "Summary", meta.id);
      try {
        const res = await apiFetch(API_URLS.savedSummary(meta.id), {}, activeSessionId);
        if (!res.ok) throw new Error("Failed to load summary");
        const data = await res.json();
        const summary = normalizeDocumentSummaryFromApi(data, {
          filename: meta.filename,
          doc_id: meta.doc_id,
        });
        if (!summary) throw new Error("No summary");
        setDocumentSummary(summary);
        setActiveSummaryTitle(
          meta.title || meta.filename || summary.filename || "Summary",
        );
      } catch (err) {
        console.error(err);
        toast({
          title: "Could not open summary",
          description: "This saved summary could not be loaded.",
          variant: "destructive",
        });
        setLeftPanelMode("chat");
      } finally {
        setSummaryLoading(false);
        setLoadingSavedSummaryId(null);
      }
    },
    [activeSessionId, openSummaryView, toast],
  );

  // ── Send message (streaming SSE — preserved from original) ──
  const sendUserMessage = async (
    messageText: string,
    sourceIds: string[] = [],
    activeDocuments?: ActiveDocument[],
  ) => {
    const trimmedText = messageText.trim();
    if (loading) return;
    if (!activeChatId) {
      createNewChat();
      return;
    }

    const activeChat = chats.find((c) => c.id === activeChatId);
    if (!activeChat) return;

    const scopeRaw =
      activeChatId && researchScopeByChat[activeChatId]
        ? researchScopeByChat[activeChatId]
        : "library";
    const scope: ResearchScope = scopeRaw === "discover" ? "discover" : "library";
    const libraryTurn = scope === "library";

    if (!trimmedText && (libraryTurn ? sourceIds.length === 0 : true)) return;

    const scopedActiveDocuments =
      !libraryTurn || sourceIds.length > 0
        ? []
        : scopedActiveDocumentsForMessage(ingestedFiles, selectedChatDocIds, activeDocuments);

    const effectiveSourceIds = libraryTurn ? sourceIds : [];
    const question = chatQuestionText(trimmedText, effectiveSourceIds);

    setMessages((prev) => [...prev, ...streamingTurnMessages(question)]);
    setLoading(true);
    scrollToBottom();

    abortControllerRef.current = new AbortController();
    let botRaw = "";

    try {
      const response = await apiFetch(
        API_URLS.chat,
        {
          method: "POST",
          signal: abortControllerRef.current.signal,
          headers: { "Content-Type": "application/json" },
          body: buildChatPostBody(question, {
            sourceIds: effectiveSourceIds,
            activeDocuments: scopedActiveDocuments,
            retrievalScope: scope,
          }),
        },
        activeChat.sessionId,
      );

      if (!response.ok) {
        const errorMessage = await getApiErrorMessage(response);
        toast({
          title: "Could not send message",
          description: errorMessage,
          variant: "destructive",
        });
        setMessages((prev) =>
          updateLastBotMessage(prev, { text: errorMessage, raw: errorMessage }),
        );
        setSummaryLoading(false);
        return;
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const currentSessionId = activeChat.sessionId;

      await consumeChatSseStream(reader, (event) => {
        switch (event.type) {
          case "session_title":
            setChats((prev) =>
              prev.map((c) =>
                c.sessionId === currentSessionId ? { ...c, title: event.title } : c,
              ),
            );
            break;
          case "sources": {
            const sources = normalizeChatSources(event.sources);
            setMessages((prev) =>
              updateLastBotMessage(prev, { sources }),
            );
            if (sources.length > 0) {
              selectSourceForPreview(sources[0]!, { showPdf: true });
            }
            break;
          }
          case "external_papers": {
            const externalPapers = normalizeExternalPapers(event.papers);
            setMessages((prev) =>
              updateLastBotMessage(prev, { externalPapers }),
            );
            break;
          }
          case "highlight":
            setMessages((prev) =>
              updateLastBotMessage(prev, { highlightAction: event.highlight }),
            );
            break;
          case "summaries": {
            const firstIngested = ingestedFiles[0];
            const normalized = normalizeDocumentSummaryFromSummariesEvent(event.summaries, {
              filename: firstIngested?.filename ?? "",
              doc_id: firstIngested?.doc_id?.trim() ?? "",
            });
            setDocumentSummary(normalized);
            setSummaryLoading(false);
            if (normalized) {
              openSummaryView(
                normalized.filename || firstIngested?.filename || "Summary",
                normalized.summary_id,
              );
            }
            break;
          }
          case "content":
            if (!event.text) break;
            botRaw += event.text;
            setMessages((prev) => updateLastBotMessage(prev, { text: botRaw, raw: botRaw }));
            scrollToBottom();
            break;
          default:
            break;
        }
      });
    } catch {
      setMessages((prev) =>
        updateLastBotMessage(prev, {
          text: CHAT_STREAM_ERROR,
          raw: CHAT_STREAM_ERROR,
        }),
      );
    } finally {
      setLoading(false);
      setSummaryLoading(false);
      abortControllerRef.current = null;
      scrollToBottom();
    }
  };

  const canSend =
    !loading &&
    (researchScope === "library"
      ? !!input.trim() || pendingSourceRefs.length > 0
      : !!input.trim());

  const setResearchScope = useCallback(
    (scope: ResearchScope) => {
      if (!activeChatId) return;
      setResearchScopeByChat((prev) => ({ ...prev, [activeChatId]: scope }));
      if (scope === "discover") {
        setSelectedChatDocIds([]);
        setPendingSourceRefs([]);
      } else {
        setActiveExternalPaper(null);
      }
    },
    [activeChatId],
  );

  const handleSend = () => {
    if (!canSend) return;
    const libraryTurn = researchScope === "library";
    const sourceIds = libraryTurn ? pendingSourceRefs.map((s) => s.id).filter(Boolean) : [];
    const text = input;
    setInput("");
    setPendingSourceRefs([]);
    sendUserMessage(
      text,
      sourceIds,
      libraryTurn ? activeDocumentsFromIngested(ingestedFiles, selectedChatDocIds) : undefined,
    );
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && canSend) {
      e.preventDefault();
      handleSend();
    }
  };

  const [, navigate] = useLocation();

  const openReaderForFile = useCallback(
    (file: IngestedFile) => {
      const docId = file.doc_id?.trim();
      const sessionId = file.session_id?.trim() || activeSessionId;
      if (!sessionId || !docId) {
        toast({
          title: "Can't open reader",
          description: "Document id not available for this file.",
          variant: "destructive",
        });
        return;
      }
      navigate(
        `/reader?session=${encodeURIComponent(sessionId)}&doc=${encodeURIComponent(docId)}&name=${encodeURIComponent(file.filename)}`,
      );
    },
    [activeSessionId, navigate, toast],
  );

  const openReaderForSource = useCallback(
    (source: Source) => {
      const docId = getDocId(source, ingestedFiles);
      if (!activeSessionId || !docId) {
        toast({
          title: "Can't open reader",
          description: "Document id not available for this source.",
          variant: "destructive",
        });
        return;
      }
      const jumpTarget = sourceJumpTarget(source);
      storeReaderHighlight(activeSessionId, docId, jumpTarget);
      const params = new URLSearchParams({
        session: activeSessionId,
        doc: docId,
        name: getDocDisplayName(source),
      });
      navigate(`/reader?${params.toString()}`);
    },
    [activeSessionId, ingestedFiles, navigate, toast],
  );

  // ── Fetch ingested files from backend ──
  const fetchIngestedFiles = useCallback(async (sessionId: string) => {
    if (!sessionId) return;

    setIngestedFilesLoading(true);
    try {
      const listed = await fetchSessionIngestedFiles(sessionId);
      setIngestedFiles(listed);
      setSelectedChatDocIds((prev) => pruneSelectedDocIds(prev, listed));
    } catch {
      toast({
        title: "Could not load papers",
        description: "Your library list could not be loaded. Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIngestedFilesLoading(false);
    }
  }, [toast]);

  const refreshLibraryFiles = useCallback(async () => {
    setLibraryFilesLoading(true);
    try {
      const listed = await fetchAllIngestedFiles();
      setLibraryFiles(listed);
    } catch {
      toast({
        title: "Could not load library",
        description: "Your papers could not be loaded. Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLibraryFilesLoading(false);
    }
  }, [toast]);

  const openLibrary = useCallback(() => {
    setSidebarView("library");
    setMenuOpenId(null);
    setActiveSource(null);
    setActiveExternalPaper(null);
    setShowRightPanel(false);
    setShowPDF(false);
    setLeftPanelMode("chat");
    setDocumentSummary(null);
    setSummaryLoading(false);
    setActiveSummaryTitle("");
    setActiveSummaryId(null);
    void refreshLibraryFiles();
  }, [refreshLibraryFiles]);

  const downloadLibraryFile = useCallback(
    async (file: IngestedFile) => {
      const docId = file.doc_id?.trim();
      const sessionId = file.session_id?.trim();
      if (!docId || !sessionId) {
        toast({
          title: "Download failed",
          description: "Document or session id not available for this file.",
          variant: "destructive",
        });
        return;
      }

      setDownloadingFile(file.filename);
      try {
        await downloadIngestedFile(file);
      } catch {
        toast({
          title: "Download failed",
          description: "The file could not be downloaded. Try again.",
          variant: "destructive",
        });
      } finally {
        setDownloadingFile(null);
      }
    },
    [toast],
  );

  const addExternalPaperToLibrary = useCallback(
    async (paper: ExternalPaper) => {
      if (!paper.pdf_verified || !paper.pdf_url) return;
      const activeChat = chats.find((c) => c.id === activeChatId);
      if (!activeChat?.sessionId) return;

      setAddingExternalPaperId(paper.id);
      try {
        const res = await apiFetch(
          API_URLS.ingest,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sources: [{ url: paper.pdf_url, paper_id: paper.id }],
            }),
          },
          activeChat.sessionId,
        );
        if (!res.ok) {
          const message = await getApiErrorMessage(
            res,
            "Could not add this paper to your library.",
            "upload",
          );
          if (res.status === 409) {
            toast({
              title: "Already in library",
              description: message.replace(/\bcorpus\b/gi, "library"),
            });
            await fetchIngestedFiles(activeChat.sessionId);
            return;
          }
          toast({ title: "Add to library failed", description: message, variant: "destructive" });
          return;
        }
        toast({ title: "Added to library", description: paper.title });
        await fetchIngestedFiles(activeChat.sessionId);
      } catch {
        toast({
          title: "Add to library failed",
          description: "Something went wrong. Try again in a moment.",
          variant: "destructive",
        });
      } finally {
        setAddingExternalPaperId(null);
      }
    },
    [activeChatId, chats, fetchIngestedFiles, toast],
  );

  // ── Delete ingested file from backend ──
  const handleDeleteIngestedFile = useCallback(
    async (file: IngestedFile) => {
      const docId = file.doc_id?.trim();
      const filename = file.filename;
      const activeChat = chats.find((c) => c.id === activeChatId);
      const sessionId = file.session_id?.trim() || activeChat?.sessionId;
      const targetChat = sessionId ? chats.find((c) => c.sessionId === sessionId) : activeChat;
      if (!sessionId || !targetChat) {
        toast({
          title: "Delete failed",
          description: "Session context not available for this file.",
          variant: "destructive",
        });
        return;
      }
      if (!docId) {
        toast({
          title: "Delete failed",
          description: "Document id not available for this file.",
          variant: "destructive",
        });
        return;
      }

      setDeletingFile(filename);
      try {
        const res = await apiFetch(
          API_URLS.ingestFiles,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ doc_id: docId }),
          },
          sessionId,
        );
        if (res.ok) {
          let deletedChunkIds: string[] = [];
          try {
            const data = await res.json();
            if (Array.isArray(data?.deleted_chunk_ids)) {
              deletedChunkIds = data.deleted_chunk_ids.filter((x: any) => typeof x === "string");
            }
          } catch {
            // ignore JSON parse errors
          }

          if (deletedChunkIds.length > 0) {
            // Persist tombstones for this chat
            setDeletedSourceIdsByChat((prev) => {
              const existing = prev[targetChat.id] ?? [];
              const merged = new Set<string>(existing);
              deletedChunkIds.forEach((id) => merged.add(id));
              return { ...prev, [targetChat.id]: Array.from(merged) };
            });

            // Prune deleted sources from in-memory messages so chips/panels don't reference them.
            const tombstones = new Set<string>(deletedChunkIds);
            setChats((prev) =>
              prev.map((c) => {
                if (c.id !== targetChat.id) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) => {
                    const nextSources = m.sources?.filter((s) => !tombstones.has(s.id));
                    return {
                      ...m,
                      sources: nextSources && nextSources.length > 0 ? nextSources : undefined,
                    };
                  }),
                };
              }),
            );

            if (activeSource && tombstones.has(activeSource.id)) {
              setActiveSource(null);
              setShowPDF(false);
            }
          }

          setIngestedFiles((prev) => prev.filter((f) => f.filename !== filename));
          setLibraryFiles((prev) =>
            prev.filter((f) => f.doc_id?.trim() !== docId && f.filename !== filename),
          );
          const removedDocId = file.doc_id?.trim();
          if (removedDocId) {
            setSelectedChatDocIds((prev) => prev.filter((id) => id !== removedDocId));
          }
          // Refresh messages to clear out deleted sources
          loadConversationMessages(targetChat.id, targetChat.sessionId);
        }
      } catch {
        toast({
          title: "Delete failed",
          description: "The file could not be removed. Try again.",
          variant: "destructive",
        });
      } finally {
        setDeletingFile(null);
      }
    },
    [activeChatId, chats, toast],
  );

  // ── Generate citation for a file ──
  const handleCite = async (file: IngestedFile) => {
    const sessionId = file.session_id?.trim() || activeSessionId;
    if (!file.metadata.identifier || !sessionId) {
      toast({
        title: "Cannot generate citation",
        description: "No identifier found for this file.",
        variant: "destructive",
      });
      return;
    }

    try {
      const data = await fetchCitations([file.metadata.identifier], sessionId, {
        preferSinglePaper: true,
      });
      setCitationData(data);
    } catch {
      toast({
        title: "Citation Error",
        description: "Something went wrong while generating the citation.",
        variant: "destructive",
      });
    }
  };

  const citeLibraryFiles = useCallback(
    async (files: IngestedFile[]) => {
      if (files.length === 0) {
        toast({
          title: "Nothing to cite",
          description: "Select papers or add files to your library first.",
          variant: "destructive",
        });
        return;
      }

      setCiteLibraryLoading(true);
      try {
        const data = await fetchBatchCitations(files, activeSessionId);
        setCitationData(data);
      } catch {
        toast({
          title: "Bibliography failed",
          description: "Citations could not be generated. Try again.",
          variant: "destructive",
        });
      } finally {
        setCiteLibraryLoading(false);
      }
    },
    [activeSessionId, toast],
  );

  const exportLibraryFiles = useCallback(
    async (files: IngestedFile[], format: CitationExportFormat) => {
      if (files.length === 0) {
        toast({
          title: "Nothing to export",
          description: "Select papers or add files to your library first.",
          variant: "destructive",
        });
        return;
      }

      setExportLibraryLoading(format);
      try {
        await exportCitations(files, format, activeSessionId);
        toast({
          title: "Export ready",
          description: "Your bibliography file has been downloaded.",
        });
      } catch {
        toast({
          title: "Export failed",
          description: "The bibliography could not be exported. Try again.",
          variant: "destructive",
        });
      } finally {
        setExportLibraryLoading(null);
      }
    },
    [activeSessionId, toast],
  );

  const handleSummarizeFile = async (file: IngestedFile) => {
    const sessionId = file.session_id?.trim() || activeSessionId;
    if (!sessionId) return;
    const docId = file.doc_id?.trim();
    if (!docId) {
      toast({
        title: "Cannot summarize",
        description: "Document id is not available for this file yet.",
        variant: "destructive",
      });
      return;
    }
    setSummaryLoading(true);
    setDocumentSummary(null);
    openSummaryView(file.filename, null, "sources");
    try {
      const res = await apiFetch(API_URLS.summarizeDoc(docId), { method: "POST" }, sessionId);
      if (!res.ok) {
        const message = await getApiErrorMessage(
          res,
          "Something went wrong while summarizing the document.",
          "summary",
        );
        toast({
          title: "Summarize failed",
          description: message,
          variant: "destructive",
        });
        setLeftPanelMode("chat");
        return;
      }
      const data = await res.json();
      const summary = normalizeDocumentSummaryFromApi(data, {
        filename: file.filename,
        doc_id: docId,
      });
      if (!summary) throw new Error("Invalid response format");
      setDocumentSummary(summary);
      if (summary.summary_id) setActiveSummaryId(summary.summary_id);
      setSummariesRefreshKey((k) => k + 1);
    } catch (err) {
      console.error(err);
      toast({
        title: "Summarize failed",
        description: "Something went wrong while summarizing the document.",
        variant: "destructive",
      });
      setLeftPanelMode("chat");
    } finally {
      setSummaryLoading(false);
    }
  };

  // ── Fetch ingested files when chat switches or files are uploaded ──
  const ingestedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSessionId) {
      setIngestedFiles([]);
      ingestedSessionRef.current = null;
      return;
    }
    const sessionChanged = ingestedSessionRef.current !== activeSessionId;
    ingestedSessionRef.current = activeSessionId;
    if (sessionChanged) {
      setIngestedFiles([]);
    }
    fetchIngestedFiles(activeSessionId);
  }, [activeSessionId, fetchIngestedFiles]);

  const loadConversationMessages = useCallback(async (chatId: string, sessionId: string) => {
    try {
      const { messages: loadedMessages, title: apiTitle } = await fetchConversation(sessionId);

      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== chatId) return c;

          const updatedMessages = mergeLoadedConversationMessages(loadedMessages, c.messages);

          return {
            ...c,
            messages: updatedMessages,
            ...(apiTitle ? { title: apiTitle } : {}),
          };
        }),
      );
      if (
        loadedMessages.some(
          (m) => m.sender === "bot" && (m.externalPapers?.length ?? 0) > 0,
        )
      ) {
        setResearchScopeByChat((prev) => ({ ...prev, [chatId]: "discover" }));
      }
      setSourcesIndexReadyByChat((prev) => ({ ...prev, [chatId]: true }));
    } catch {
      toast({
        title: "Could not load chat",
        description: "Messages for this conversation could not be loaded.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // ── Load messages when chat is switched ──
  useEffect(() => {
    if (!activeChatId) return;
    const activeChat = chats.find((c) => c.id === activeChatId);
    if (activeChat) {
      setSourcesIndexReadyByChat((prev) => ({ ...prev, [activeChat.id]: false }));
      loadConversationMessages(activeChat.id, activeChat.sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

  const uploadPdfFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const activeChat = chats.find((c) => c.id === activeChatId);
      if (!activeChat) return;

      setUploadLoading(true);
      setUploadMessage(null);

      try {
        const fd = new FormData();
        for (const f of files) fd.append("file", f);

        const res = await apiFetch(API_URLS.ingest, { method: "POST", body: fd }, activeChat.sessionId);
        if (!res.ok) {
          const message = await getApiErrorMessage(
            res,
            "Upload failed. Check the server and try again.",
            "upload",
          );
          setUploadMessage(message);
          return;
        }
        const data = await res.json().catch(() => null);

        if (data?.files) {
          const uploaded = normalizeIngestedFiles(data.files);
          setUploadMessage(
            formatUploadStatusMessage(
              typeof data.message === "string" ? data.message : null,
              uploaded.length || files.length,
            ),
          );
          setIngestedFiles((prev) => mergeIngestedFiles(prev, uploaded));
          const newDocIds = uploaded
            .map((f) => f.doc_id?.trim())
            .filter((id): id is string => Boolean(id));
          if (newDocIds.length > 0) {
            setSelectedChatDocIds((prev) => Array.from(new Set([...prev, ...newDocIds])));
          }
        } else {
          setUploadMessage(
            formatUploadStatusMessage(
              typeof data?.message === "string" ? data.message : null,
              files.length,
            ),
          );
        }

        await fetchIngestedFiles(activeChat.sessionId);
      } catch {
        setUploadMessage((prev) => prev ?? "Upload failed. Check the server and try again.");
      } finally {
        setUploadLoading(false);
      }
    },
    [activeChatId, chats, fetchIngestedFiles],
  );

  return {
    chats,
    activeChatId,
    activeChat,
    activeSessionId,
    messages,
    input,
    setInput,
    loading,
    uploadLoading,
    uploadMessage,
    ingestedFiles,
    ingestedFilesLoading,
    deletingFile,
    activeSource,
    setActiveSource,
    activeExternalPaper,
    setActiveExternalPaper,
    addingExternalPaperId,
    selectExternalPaperForPreview,
    openExternalPaperLink,
    addExternalPaperToLibrary,
    pendingSourceRefs,
    setPendingSourceRefs,
    showRightPanel,
    setShowRightPanel,
    openRightPanel,
    selectSourceForPreview,
    showPDF,
    setShowPDF,
    rightPanelTab,
    setRightPanelTab,
    leftPanelMode,
    activeSummaryTitle,
    activeSummaryId,
    summariesRefreshKey,
    loadingSavedSummaryId,
    selectedChatDocIds,
    setSelectedChatDocIds,
    researchScope,
    setResearchScope,
    citationData,
    setCitationData,
    documentSummary,
    summaryLoading,
    deletedSourceIds,
    sourcesIndexReady,
    knownSourceIds,
    allSourcesById,
    globalSourceNumberById,
    panelSources,
    selectedChatDocs,
    sidebarOpen,
    setSidebarOpen,
    sidebarView,
    openLibrary,
    libraryFiles,
    libraryFilesLoading,
    refreshLibraryFiles,
    downloadingFile,
    downloadLibraryFile,
    citeLibraryLoading,
    citeLibraryFiles,
    exportLibraryLoading,
    exportLibraryFiles,
    menuOpenId,
    setMenuOpenId,
    chatWindowRef,
    chatInputRef,
    menuRef,
    createNewChat,
    deleteChat,
    switchChat,
    toggleChatDocSelection,
    exitSummaryView,
    attachSourceForChat,
    loadSavedSummary,
    handleSend,
    handleInputKeyDown,
    openReaderForFile,
    openReaderForSource,
    handleDeleteIngestedFile,
    handleCite,
    handleSummarizeFile,
    uploadPdfFiles,
    canSend,
    getDocDisplayName,
    getDocId: resolveDocId,
  };
}

export type ChatPageModel = ReturnType<typeof useChatPage>;
