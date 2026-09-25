import { create } from "zustand";

export interface CleanupFailure {
  message: string;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  action?: string;
  actionKey?: string;
  copyCommand?: string;
  technicalDetails?: {
    status?: number;
    exceptionType?: string;
    requestId?: string;
    underlyingError?: string;
  };
}

interface CleanupFailureState {
  /** Dictations handed back raw because cleanup failed, not yet surfaced to the user. */
  pending: number;
  /** Cause of the most recent failure, shown with the toast so it's actionable. */
  lastMessage: string;
  /** Structured cause and AWS diagnostics for the most recent fallback. */
  lastFailure: CleanupFailure | null;
  /** Signature queued for the toast that has not been shown yet. */
  queuedSignature: string;
  /** Signature already shown this session. The same failure is not toasted again. */
  announcedSignature: string;
}

export const useCleanupFailureStore = create<CleanupFailureState>(() => ({
  pending: 0,
  lastMessage: "",
  lastFailure: null,
  queuedSignature: "",
  announcedSignature: "",
}));

// Drop pids and Mach-O UUIDs so one startup crash counts as one toast.
export function cleanupFailureSignature(message: string): string {
  return message
    .replace(/<[^>]*>/g, "")
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function recordCleanupFailure(failure: string | CleanupFailure = ""): void {
  const normalized = typeof failure === "string" ? { message: failure } : failure;
  const signature = cleanupFailureSignature(normalized.message ?? "");
  const state = useCleanupFailureStore.getState();
  if (
    signature &&
    (signature === state.announcedSignature || signature === state.queuedSignature)
  ) {
    return;
  }
  useCleanupFailureStore.setState({
    pending: state.pending + 1,
    lastMessage: normalized.message,
    lastFailure: normalized,
    queuedSignature: signature || state.queuedSignature,
  });
}

export function consumeCleanupFailures(): number {
  const { pending, lastFailure } = useCleanupFailureStore.getState();
  if (pending > 0) {
    const signature = cleanupFailureSignature(lastFailure?.message ?? "");
    useCleanupFailureStore.setState({
      pending: 0,
      queuedSignature: "",
      announcedSignature: signature || useCleanupFailureStore.getState().announcedSignature,
    });
  }
  return pending;
}
