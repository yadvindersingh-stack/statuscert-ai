import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveEntitlement } from "@/lib/statuscert/entitlements";

export async function getFirmEntitlement(firmId: string, userEmail?: string | null) {
  const supabase = createServerSupabaseClient();
  const { data: billing } = await supabase
    .from("firm_billing")
    .select("trial_remaining, credits_balance, status, plan_type, founder_override")
    .eq("firm_id", firmId)
    .single();

  const founderEmails = (process.env.FOUNDER_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const founderOverride = !!billing?.founder_override || (userEmail ? founderEmails.includes(userEmail.toLowerCase()) : false);
  const activeSubscription =
    billing?.status === "active" && (billing?.plan_type === "monthly" || billing?.plan_type === "yearly");

  const resolved = resolveEntitlement({
    founderOverride,
    activeSubscription,
    trialRemaining: billing?.trial_remaining ?? Number(process.env.FREE_TRIAL_REVIEWS || 1),
    creditsBalance: billing?.credits_balance ?? 0
  });

  let entitlementType: "FOUNDER" | "YEARLY" | "MONTHLY" | "CREDITS" | "TRIAL" | "NONE" = "NONE";
  let entitlementLabel = "No active entitlement";
  let nearLimitMessage: string | null = null;

  if (resolved.founderOverride) {
    entitlementType = "FOUNDER";
    entitlementLabel = "Founder access (unlimited)";
  } else if (resolved.activeSubscription && billing?.plan_type === "yearly") {
    entitlementType = "YEARLY";
    entitlementLabel = "Yearly plan (unlimited)";
  } else if (resolved.activeSubscription && billing?.plan_type === "monthly") {
    entitlementType = "MONTHLY";
    entitlementLabel = "Monthly plan (unlimited)";
  } else if (resolved.creditsBalance > 0) {
    entitlementType = "CREDITS";
    entitlementLabel = `One-file credits (${resolved.creditsBalance} remaining)`;
    if (resolved.creditsBalance <= 1) {
      nearLimitMessage = "You are on your last one-file credit.";
    }
  } else if (resolved.trialRemaining > 0) {
    entitlementType = "TRIAL";
    entitlementLabel = `Free trial (${resolved.trialRemaining} review remaining)`;
    if (resolved.trialRemaining <= 1) {
      nearLimitMessage = "Your free trial is about to end.";
    }
  } else {
    nearLimitMessage = "No trial or credits remaining.";
  }

  return {
    ...resolved,
    rawPlanType: billing?.plan_type || null,
    rawStatus: billing?.status || null,
    entitlementType,
    entitlementLabel,
    nearLimitMessage
  };
}
