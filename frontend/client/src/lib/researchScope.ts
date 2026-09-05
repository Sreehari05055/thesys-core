export type ResearchScope = "library" | "discover";

export const RESEARCH_SCOPE_LABELS: Record<ResearchScope, string> = {
  library: "My library",
  discover: "Discover papers",
};

export function researchScopePlaceholder(
  scope: ResearchScope,
  options: {
    pendingCitations: number;
    selectedDocCount: number;
    singleDocName?: string;
  },
): string {
  if (scope === "discover") {
    return "Find open-access papers on the web — e.g. recent work on CRISPR delivery…";
  }
  if (options.pendingCitations > 0) {
    return "Ask about the cited passage…";
  }
  if (options.selectedDocCount === 1 && options.singleDocName) {
    return `Ask about ${options.singleDocName}…`;
  }
  if (options.selectedDocCount > 1) {
    return `Ask about ${options.selectedDocCount} selected documents…`;
  }
  return "Ask a question about your documents…";
}
