"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canGenerateReview = canGenerateReview;
exports.resolveEntitlement = resolveEntitlement;
exports.consumeEntitlement = consumeEntitlement;
function canGenerateReview(state) {
    return (state.founderOverride ||
        state.activeSubscription ||
        state.trialRemaining > 0 ||
        state.creditsBalance > 0);
}
function resolveEntitlement(state) {
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
function consumeEntitlement(state) {
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
