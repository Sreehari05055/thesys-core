const MESSAGE_TOO_LONG = "Your message is too long. Please shorten it and try again.";
const FILE_TOO_LARGE = "File too large.";

export const CHAT_STREAM_ERROR = "Sorry, something went wrong.";

const MONTHLY_MESSAGE_QUOTA_ERROR = "monthly_message_limit_exceeded";
const MONTHLY_CREDIT_QUOTA_ERROR = "monthly_credit_limit_exceeded";
const MONTHLY_TOKEN_QUOTA_ERROR = "monthly_token_limit_exceeded";
const MONTHLY_SUMMARY_QUOTA_ERROR = "monthly_summary_limit_exceeded";
const MONTHLY_FILE_UPLOAD_QUOTA_ERROR = "monthly_file_upload_limit_exceeded";

export type MonthlyQuotaKind = "chat" | "summary" | "upload";

function isMonthlyMessageQuotaError(errorCode: string | undefined): boolean {
  return (
    errorCode === MONTHLY_MESSAGE_QUOTA_ERROR ||
    errorCode === MONTHLY_CREDIT_QUOTA_ERROR ||
    errorCode === MONTHLY_TOKEN_QUOTA_ERROR
  );
}

function isMonthlySummaryQuotaError(errorCode: string | undefined): boolean {
  return errorCode === MONTHLY_SUMMARY_QUOTA_ERROR;
}

function isMonthlyFileUploadQuotaError(errorCode: string | undefined): boolean {
  return errorCode === MONTHLY_FILE_UPLOAD_QUOTA_ERROR;
}

function isMonthlyQuotaError(errorCode: string | undefined): boolean {
  return (
    isMonthlyMessageQuotaError(errorCode) ||
    isMonthlySummaryQuotaError(errorCode) ||
    isMonthlyFileUploadQuotaError(errorCode)
  );
}

function isUploadQuotaDetail(detail: Record<string, unknown>): boolean {
  return (
    "files_uploaded" in detail ||
    "monthly_file_upload_limit" in detail ||
    "monthly_upload_bytes_limit" in detail ||
    "bytes_to_add" in detail
  );
}

function monthlyQuotaKindFromDetail(
  detail: Record<string, unknown>,
  errorCode: string | undefined,
): MonthlyQuotaKind {
  if (isMonthlySummaryQuotaError(errorCode)) return "summary";
  if (isMonthlyFileUploadQuotaError(errorCode)) return "upload";
  if (isMonthlyMessageQuotaError(errorCode)) return "chat";
  if ("summaries_used" in detail || "monthly_summary_limit" in detail) return "summary";
  if (isUploadQuotaDetail(detail)) return "upload";
  if ("messages_used" in detail || "monthly_message_limit" in detail) return "chat";
  if (
    "credits_used" in detail ||
    "total_allocated_credits" in detail ||
    "monthly_credit_limit" in detail ||
    "tokens_used" in detail ||
    "total_allocated_tokens" in detail ||
    "monthly_token_limit" in detail
  ) {
    return "chat";
  }
  return "chat";
}

function formatQuotaRefreshDate(periodEnd: unknown): string | null {
  if (typeof periodEnd !== "string" || !periodEnd.trim()) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(periodEnd));
  } catch {
    return periodEnd;
  }
}

function monthlyQuotaLabel(kind: MonthlyQuotaKind): string {
  switch (kind) {
    case "chat":
      return "credit";
    case "summary":
      return "summary";
    case "upload":
      return "upload";
  }
}

function monthlyQuotaExceededMessage(
  detail: Record<string, unknown>,
  kind: MonthlyQuotaKind,
): string {
  const label = monthlyQuotaLabel(kind);
  const refreshOn = formatQuotaRefreshDate(detail.period_end);
  if (refreshOn) {
    return `Monthly ${label} quota exceeded. Your quota will refresh on ${refreshOn}.`;
  }
  return `Monthly ${label} quota exceeded. Your quota will refresh at the end of your billing period.`;
}

function duplicateFilenamesFromDetail(detail: Record<string, unknown>): string[] {
  const files = detail.files;
  if (!Array.isArray(files)) return [];
  const names: string[] = [];
  for (const item of files) {
    if (!item || typeof item !== "object") continue;
    const filename = (item as Record<string, unknown>).filename;
    if (typeof filename === "string" && filename.trim()) {
      names.push(filename.trim());
    }
  }
  return names;
}

function duplicateContentMessage(detail: Record<string, unknown>): string {
  const names = duplicateFilenamesFromDetail(detail);
  if (names.length === 1) {
    return `${names[0]} is already in your corpus.`;
  }
  if (names.length > 1) {
    return `These files are already in your corpus: ${names.join(", ")}.`;
  }
  return "Duplicate content — already in your corpus.";
}

function isLengthRelated(text: string, errorCode?: string): boolean {
  if (errorCode === "question_too_many_tokens") return true;
  const lower = text.toLowerCase();
  return /token|sequence length|too long|too many/.test(lower);
}

/** Read a user-facing message from a failed API response (FastAPI ``detail`` string or object). */
export async function getApiErrorMessage(
  res: Response,
  fallback = CHAT_STREAM_ERROR,
  quotaKind?: MonthlyQuotaKind,
): Promise<string> {
  try {
    const data = (await res.json()) as Record<string, unknown>;
    const detail = data.detail;

    if (typeof detail === "string" && detail.trim()) {
      return isLengthRelated(detail) ? MESSAGE_TOO_LONG : detail.trim();
    }

    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const d = detail as Record<string, unknown>;
      const errorCode = typeof d.error === "string" ? d.error : undefined;
      if (res.status === 429 || isMonthlyQuotaError(errorCode)) {
        const kind = quotaKind ?? monthlyQuotaKindFromDetail(d, errorCode);
        return monthlyQuotaExceededMessage(d, kind);
      }
      if (res.status === 413 || errorCode === "file_too_large") {
        return FILE_TOO_LARGE;
      }
      if (res.status === 409 || errorCode === "duplicate_content") {
        return duplicateContentMessage(d);
      }
      if (typeof d.message === "string" && d.message.trim()) {
        return isLengthRelated(d.message, errorCode) ? MESSAGE_TOO_LONG : d.message.trim();
      }
      if (errorCode === "question_too_many_tokens") return MESSAGE_TOO_LONG;
    }

    if (typeof data.error === "string" && data.error.trim()) {
      const err = data.error.trim();
      if (err === "file_too_large") return FILE_TOO_LARGE;
      if (err === "duplicate_content") return duplicateContentMessage(data);
      return isLengthRelated(err) ? MESSAGE_TOO_LONG : err;
    }
    if (typeof data.message === "string" && data.message.trim()) {
      return isLengthRelated(data.message) ? MESSAGE_TOO_LONG : data.message.trim();
    }
  } catch {
    // not JSON
  }

  if (res.status === 429) {
    return monthlyQuotaExceededMessage({}, quotaKind ?? "chat");
  }
  if (res.status === 413) return FILE_TOO_LARGE;
  if (res.status === 409) return duplicateContentMessage({});
  if (res.status === 400) return MESSAGE_TOO_LONG;
  return fallback;
}
