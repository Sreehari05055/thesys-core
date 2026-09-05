import { CitationDialog } from "@/components/CitationDialog";
import { PageHead } from "@/components/PageHead";
import { ChatMainPanel } from "@/components/chat/ChatMainPanel";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { useChatPage } from "@/hooks/useChatPage";

export function ChatPage() {
  const model = useChatPage();
  const workspaceTitle = model.activeChat?.title ?? "Research workspace";

  return (
    <>
      <PageHead title={workspaceTitle} noIndex />
      <div className="rag-panel h-screen w-full overflow-hidden" data-testid="page-rag-shell">
        {model.citationData && (
          <CitationDialog
            data={model.citationData}
            onClose={() => model.setCitationData(null)}
          />
        )}

        <div className="flex h-full w-full">
          <ChatSidebar model={model} />
          <ChatMainPanel model={model} />
        </div>
      </div>
    </>
  );
}
