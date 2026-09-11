import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "./useAuth";
import {
  getUsageState,
  isPastDueUsage,
  loadUsage,
  retryUsage,
  setUsageAccount,
  subscribeUsage,
  watchForUpgrade,
  type UsageResponse,
  type UsageState,
} from "../lib/usageStore";

export interface UseUsageResult {
  /** Entitlement is only known when this is `"success"`. Gate billing UI on it. */
  status: UsageState["status"];
  isRefreshing: boolean;
  isRetrying: boolean;
  error: string | null;
  retry: () => Promise<void>;
  refetch: () => Promise<void>;
  /** `null` while the entitlement is unknown — never assume free. */
  hasPaidAccess: boolean | null;
  /**
   * `hasPaidAccess` with the unknown case resolved in the account's favour, for
   * gates where locking out a payer costs more than briefly over-granting
   * (the server stays authoritative).
   */
  hasPaidAccessOptimistic: boolean;
  plan: string;
  isPastDue: boolean;
  wordsUsed: number;
  wordsRemaining: number;
  limit: number;
  isSubscribed: boolean;
  isPersonallySubscribed: boolean;
  entitledWorkspaceIds: string[];
  isTrial: boolean;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  billingInterval: "monthly" | "annual" | null;
  isOverLimit: boolean;
  isApproachingLimit: boolean;
  resetAt: string | null;
  /** Any Stripe action — checkout, switch-plan or portal — is in flight; they share one guard. */
  checkoutLoading: boolean;
  openCheckout: (opts?: {
    plan?: "monthly" | "annual";
    tier?: "pro" | "business";
  }) => Promise<{ success: boolean; error?: string }>;
  openBillingPortal: () => Promise<{ success: boolean; error?: string; code?: string }>;
  switchPlan: (opts: {
    plan: "monthly" | "annual";
    tier: "pro" | "business";
  }) => Promise<{ success: boolean; alreadyOnPlan?: boolean; error?: string }>;
  previewSwitchPlan: (opts: { plan: "monthly" | "annual"; tier: "pro" | "business" }) => Promise<{
    success: boolean;
    immediateAmount?: number;
    currency?: string;
    currentPriceAmount?: number;
    currentInterval?: string;
    newPriceAmount?: number;
    newInterval?: string;
    nextBillingDate?: string;
    alreadyOnPlan?: boolean;
    error?: string;
  }>;
}

const BILLING_RETIRED_ERROR = "Billing has been retired";

async function fetchUsageResponse(): Promise<UsageResponse> {
  // Billing/usage metering has been retired in this build.
  // Return a fully-entitled, never-over-limit payload without any network calls.
  return {
    wordsUsed: 0,
    wordsRemaining: 0,
    limit: -1,
    plan: "pro",
    status: "active",
    isSubscribed: true,
    isTrial: false,
    trialDaysLeft: null,
    currentPeriodEnd: null,
    billingInterval: null,
    resetAt: null,
    entitlementSources: {
      personal: true,
      workspaceIds: [],
    },
  };
}

export function useUsage(): UseUsageResult | null {
  const { isSignedIn, isLoaded, user } = useAuth();
  const state = useSyncExternalStore(subscribeUsage, getUsageState);

  const accountId = isSignedIn ? (user?.id ?? null) : null;

  useEffect(() => {
    if (!isLoaded) return;
    setUsageAccount(accountId);
  }, [isLoaded, accountId]);

  useEffect(() => {
    if (!isLoaded || !accountId) return;

    void loadUsage(fetchUsageResponse);

    const handleUsageChanged = () => {
      void loadUsage(fetchUsageResponse, { force: true });
    };
    const handleUpgradeSuccess = () => {
      void watchForUpgrade(fetchUsageResponse);
    };
    window.addEventListener("usage-changed", handleUsageChanged);
    window.addEventListener("upgrade-success", handleUpgradeSuccess);
    return () => {
      window.removeEventListener("usage-changed", handleUsageChanged);
      window.removeEventListener("upgrade-success", handleUpgradeSuccess);
    };
  }, [isLoaded, accountId]);

  const refetch = useCallback(() => loadUsage(fetchUsageResponse, { force: true }), []);
  const retry = useCallback(() => retryUsage(fetchUsageResponse), []);

  const openCheckout = useCallback(
    async (opts?: {
      plan?: "monthly" | "annual";
      tier?: "pro" | "business";
    }): Promise<{ success: boolean; error?: string }> => {
      void opts;
      return { success: false, error: BILLING_RETIRED_ERROR };
    },
    []
  );

  const openBillingPortal = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
    code?: string;
  }> => {
    return { success: false, error: BILLING_RETIRED_ERROR };
  }, []);

  const switchPlan = useCallback(
    async (opts: {
      plan: "monthly" | "annual";
      tier: "pro" | "business";
    }): Promise<{ success: boolean; alreadyOnPlan?: boolean; error?: string }> => {
      void opts;
      return { success: false, error: BILLING_RETIRED_ERROR };
    },
    []
  );

  const previewSwitchPlan = useCallback(
    async (opts: { plan: "monthly" | "annual"; tier: "pro" | "business" }) => {
      void opts;
      return { success: false as const, error: BILLING_RETIRED_ERROR };
    },
    []
  );

  if (!isSignedIn) return null;

  const data = state.status === "success" ? state.data : null;
  const wordsUsed = data?.wordsUsed ?? 0;
  const limit = data?.limit ?? 0;
  const isSubscribed = data?.isSubscribed ?? false;
  const isTrial = data?.isTrial ?? false;
  const hasPaidAccess = data ? data.isSubscribed || data.isTrial : null;
  const isOverLimit = Boolean(data) && !isSubscribed && limit > 0 && wordsUsed >= limit;
  const isApproachingLimit =
    Boolean(data) && !isSubscribed && limit > 0 && wordsUsed >= limit * 0.8 && !isOverLimit;

  return {
    status: state.status,
    isRefreshing: state.status === "success" && state.isRefreshing,
    isRetrying: state.status === "error" && state.isRetrying,
    error: state.status === "error" ? state.error : null,
    retry,
    refetch,
    hasPaidAccess,
    hasPaidAccessOptimistic: hasPaidAccess !== false,
    plan: data?.plan ?? "free",
    isPastDue: data ? isPastDueUsage(data) : false,
    wordsUsed,
    wordsRemaining: data?.wordsRemaining ?? 0,
    limit,
    isSubscribed,
    isPersonallySubscribed: data?.entitlementSources.personal ?? false,
    entitledWorkspaceIds: data?.entitlementSources.workspaceIds ?? [],
    isTrial,
    trialDaysLeft: data?.trialDaysLeft ?? null,
    currentPeriodEnd: data?.currentPeriodEnd ?? null,
    billingInterval: data?.billingInterval ?? null,
    isOverLimit,
    isApproachingLimit,
    resetAt: data?.resetAt ?? null,
    checkoutLoading: false,
    openCheckout,
    openBillingPortal,
    switchPlan,
    previewSwitchPlan,
  };
}
