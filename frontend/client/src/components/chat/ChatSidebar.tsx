import { useEffect, useState } from "react";
import { Link } from "wouter";
import type { ChatPageModel } from "@/hooks/useChatPage";
import { SiteLogo, WeaveLogoIcon } from "@/components/WeaveLogo";
import { SITE_NAME } from "@/lib/siteMeta";
import { cn } from "@/lib/utils";

type ChatSidebarProps = {
  model: ChatPageModel;
};

function SiteMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className={`flex min-w-0 items-center ${compact ? "justify-center" : ""}`}
      title={SITE_NAME}
    >
      <SiteLogo showName={!compact} />
    </Link>
  );
}

function SidebarExpandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9 3 3-3 3" />
    </svg>
  );
}

function SidebarCollapseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9-3 3 3 3" />
    </svg>
  );
}

function BookmarkSimpleIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("block shrink-0", className)}
      aria-hidden
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function ChatSidebar({ model }: ChatSidebarProps) {
  const {
    sidebarOpen,
    setSidebarOpen,
    createNewChat,
    chats,
    activeChatId,
    switchChat,
    menuOpenId,
    setMenuOpenId,
    menuRef,
    deleteChat,
    sidebarView,
    openLibrary,
  } = model;

  const [pendingDeleteChatId, setPendingDeleteChatId] = useState<string | null>(null);
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  const pendingDeleteChat = chats.find((c) => c.id === pendingDeleteChatId) ?? null;

  useEffect(() => {
    if (!sidebarOpen) setMenuOpenId(null);
  }, [sidebarOpen, setMenuOpenId]);

  useEffect(() => {
    if (!sessionsExpanded) setMenuOpenId(null);
  }, [sessionsExpanded, setMenuOpenId]);

  const closeDeleteDialog = () => setPendingDeleteChatId(null);
  const confirmDeleteChat = () => {
    if (!pendingDeleteChatId) return;
    deleteChat(pendingDeleteChatId);
    setPendingDeleteChatId(null);
  };

  return (
    <nav
      aria-label="Workspace"
      className={cn(
        "sidebar-transition h-full flex flex-col bg-card border-r border-border",
        sidebarOpen ? "sidebar-open" : "sidebar-closed",
      )}
      data-testid="panel-sidebar"
    >
      {/* Header */}
      <div
        className={cn(
          "flex h-12 shrink-0 items-center border-b border-border px-3",
          sidebarOpen ? "justify-between" : "justify-start",
        )}
      >
        {sidebarOpen ? (
          <>
            <SiteMark />
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="icon-btn"
              title="Collapse sidebar"
              data-testid="button-sidebar-toggle"
            >
              <SidebarCollapseIcon />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="group relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent"
            title="Expand sidebar"
            aria-label="Expand sidebar"
            data-testid="button-sidebar-toggle"
          >
            <WeaveLogoIcon className="transition-opacity duration-150 group-hover:opacity-0" />
            <span className="absolute inset-0 flex items-center justify-center text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:text-foreground group-hover:opacity-100">
              <SidebarExpandIcon />
            </span>
          </button>
        )}
      </div>

      {/* New chat — only when sidebar is expanded */}
      {sidebarOpen ? (
        <div className="px-3 pt-3 pb-2 shrink-0">
          <button
            type="button"
            onClick={createNewChat}
            className="w-full flex items-center gap-2 rounded-md border border-primary/20 bg-primary/8 text-primary hover:bg-primary/14 hover:border-primary/35 transition-all font-semibold px-3 py-2 text-[13px]"
            data-testid="button-new-chat"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New session
          </button>
        </div>
      ) : null}

      {/* Session list — only when sidebar is expanded */}
      {sidebarOpen ? (
        <div className="flex min-h-0 flex-1 flex-col px-2 py-1">
          <button
            type="button"
            onClick={openLibrary}
            className={cn(
              "chat-item group mb-1 w-full shrink-0",
              sidebarView === "library" && "chat-item--active",
            )}
            data-testid="button-my-library"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3.5">
              <BookmarkSimpleIcon size={14} className="shrink-0 opacity-70" />
              <span
                className={cn(
                  "truncate text-[13px] leading-snug",
                  sidebarView === "library" ? "font-medium text-foreground" : "text-foreground/65",
                )}
              >
                My Library
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSessionsExpanded((open) => !open)}
            className="flex w-full shrink-0 items-center gap-1 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/60"
            title={sessionsExpanded ? "Hide sessions" : "Show sessions"}
            aria-expanded={sessionsExpanded}
            aria-controls="sidebar-sessions-list"
            data-testid="button-toggle-sessions-list"
          >
            <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/75">
              Sessions
            </span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                "shrink-0 text-muted-foreground/70 transition-transform duration-200",
                sessionsExpanded ? "rotate-0" : "-rotate-90",
              )}
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {sessionsExpanded ? (
            <div
              id="sidebar-sessions-list"
              className="min-h-0 flex-1 space-y-px overflow-y-auto rag-scrollbar"
              data-testid="list-chat-history"
            >
              {chats.map((chat) => {
                const isActive = sidebarView === "session" && chat.id === activeChatId;
                return (
                  <div
                    key={chat.id}
                    className={`chat-item group ${isActive ? "chat-item--active" : ""}`}
                    onClick={() => switchChat(chat.id)}
                    data-testid={`chat-item-${chat.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] truncate leading-snug ${isActive ? "text-foreground font-medium" : "text-foreground/65"}`}>
                        {chat.title}
                      </div>
                    </div>
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === chat.id ? null : chat.id);
                        }}
                        className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                        data-testid={`button-chat-menu-${chat.id}`}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="1.8" />
                          <circle cx="12" cy="12" r="1.8" />
                          <circle cx="12" cy="19" r="1.8" />
                        </svg>
                      </button>
                      {menuOpenId === chat.id && (
                        <div
                          ref={menuRef}
                          className="absolute right-0 top-7 z-50 w-36 rounded-lg border border-border bg-popover shadow-lg py-1"
                          data-testid={`menu-chat-${chat.id}`}
                        >
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-destructive hover:bg-destructive/8 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(null);
                              setPendingDeleteChatId(chat.id);
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {chats.length === 0 && (
                <div className="text-[12px] text-muted-foreground/50 text-center py-10 px-4 leading-relaxed">
                  No sessions yet
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1" aria-hidden />
          )}
        </div>
      ) : (
        <div className="flex-1" aria-hidden />
      )}

      {/* Delete dialog */}
      {pendingDeleteChat && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
          onClick={closeDeleteDialog}
          role="presentation"
          data-testid="delete-chat-dialog-backdrop"
        >
          <div
            role="alertdialog"
            aria-labelledby="delete-chat-dialog-title"
            aria-describedby="delete-chat-dialog-description"
            className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            data-testid="delete-chat-dialog"
          >
            <h3 id="delete-chat-dialog-title" className="text-[15px] font-semibold text-foreground">
              Delete session?
            </h3>
            <p id="delete-chat-dialog-description" className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">{pendingDeleteChat.title}</span> will be permanently removed.
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="rounded-md border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-accent transition-colors"
                data-testid="button-delete-chat-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteChat}
                className="rounded-md bg-destructive px-4 py-2 text-[13px] font-semibold text-white hover:bg-destructive/85 transition-colors"
                data-testid="button-delete-chat-confirm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
