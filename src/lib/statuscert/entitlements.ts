export type EntitlementState = {
  founderOverride: boolean;
  activeSubscription: boolean;
  trialRemaining: number;
  creditsBalance: number;
};

export type EntitlementDecision = EntitlementState & {
  allowed: boolean;
  reason:
    | "FOUNDER_OVERRIDE"
    | "ACTIVE_SUBSCRIPTION"
    | "TRIAL_AVAILABLE"
    | "CREDITS_AVAILABLE"
    | "NO_ENTITLEMENTS";
};

export function canGenerateReview(state: EntitlementState) {
  return (
    state.founderOverride ||
    state.activeSubscription ||
    state.trialRemaining > 0 ||
    state.creditsBalance > 0
  );
}

export function resolveEntitlement(state: EntitlementState): EntitlementDecision {
  if (state.founderOverride) {
    return { ...state, allowed: true, reason: "FOUNDER_OVERRIDE" };
  }
  if (state.activeSubscription) {
    return { ...state, allowed: true, reason: "ACTIVE_SUBSCRIPTION" };
  }
  if (state.trialRemaining > 0) {
    return { ...state, allowed: true, reason: "TRIAL_AVAILABLE" };
  }
  if (state.creditsBalance > 0) {
    return { ...state, allowed: true, reason: "CREDITS_AVAILABLE" };
  }
  return { ...state, allowed: false, reason: "NO_ENTITLEMENTS" };
}

export function consumeEntitlement(state: EntitlementState) {
  if (state.founderOverride || state.activeSubscription) {
    return { ...state };
  }

  if (state.trialRemaining > 0) {
    return { ...state, trialRemaining: state.trialRemaining - 1 };
  }

  if (state.creditsBalance > 0) {
    return { ...state, creditsBalance: state.creditsBalance - 1 };
  }

  return { ...state };
}
