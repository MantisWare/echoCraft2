import { useState, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { selectPolicyEffectiveSettings, useSettingsStore } from "../stores/settingsStore";
import { usePolicySnapshot } from "./usePolicy";

interface UseNotesOnboardingReturn {
  isComplete: boolean;
  isProUser: boolean;
  isProLoading: boolean;
  isLLMConfigured: boolean;
  complete: () => void;
}

export function useNotesOnboarding(): UseNotesOnboardingReturn {
  // Subscriptions have been retired: onboarding should never skip cleanup
  // model configuration.
  const isProUser = false;
  const isProLoading = false;
  const policyState = usePolicySnapshot();
  const { useCleanupModel, effectiveModel } = useSettingsStore(
    useShallow((settings) => {
      const effective = selectPolicyEffectiveSettings(settings, policyState);
      return {
        useCleanupModel: effective.useCleanupModel,
        effectiveModel: effective.cleanupModel,
      };
    })
  );

  const [isComplete, setIsComplete] = useState(
    () => localStorage.getItem("notesOnboardingComplete") === "true"
  );

  const isLLMConfigured = useCleanupModel && !!effectiveModel;

  const complete = useCallback(() => {
    localStorage.setItem("notesOnboardingComplete", "true");
    setIsComplete(true);
  }, []);

  return { isComplete, isProUser, isProLoading, isLLMConfigured, complete };
}
