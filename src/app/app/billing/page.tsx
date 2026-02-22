import Link from "next/link";
import { requireFirmId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getFirmEntitlement } from "@/lib/billing";

export default async function BillingPage({
  searchParams
}: {
  searchParams?: { source?: string; success?: string; canceled?: string };
}) {
  const { firmId, user } = await requireFirmId();
  const supabase = createServerSupabaseClient();
  const entitlement = await getFirmEntitlement(firmId, user.email);

  const { data: billing } = await supabase
    .from("firm_billing")
    .select("plan_type, status, trial_remaining, credits_balance, founder_override")
    .eq("firm_id", firmId)
    .single();

  const isOnboarding = searchParams?.source === "onboarding";

  return (
    <div className="space-y-6">
      <div>
        <p className="section-title">Billing</p>
        <h1 className="font-serif text-3xl font-semibold">Choose your plan</h1>
        <p className="mt-2 text-sm text-slate">Unlimited plans for active firms or one-file credits for occasional use.</p>
      </div>

      {isOnboarding ? (
        <div className="rounded-xl border border-[#E9DEBF] bg-[#FFFDF6] p-4 text-sm text-slate">
          Set up billing to continue once your free trial ends.
        </div>
      ) : null}
      {searchParams?.success === "true" ? (
        <div className="rounded-xl border border-[#C7D9CC] bg-[#F2FAF4] p-4 text-sm text-[#1E5B2B]">Billing updated successfully.</div>
      ) : null}
      {searchParams?.canceled === "true" ? (
        <div className="rounded-xl border border-[#E6D1B8] bg-[#FFF8EE] p-4 text-sm text-slate">Checkout canceled. No changes were made.</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <form action="/api/stripe/checkout" method="POST" className="card p-5 space-y-3">
          <input type="hidden" name="plan" value="monthly" />
          <h2 className="font-serif text-xl font-semibold">$50 / month</h2>
          <p className="text-sm text-slate">Unlimited status certificate reviews.</p>
          <button className="btn btn-primary w-full">Start Monthly</button>
        </form>
        <form action="/api/stripe/checkout" method="POST" className="card p-5 space-y-3">
          <input type="hidden" name="plan" value="yearly" />
          <h2 className="font-serif text-xl font-semibold">$500 / year</h2>
          <p className="text-sm text-slate">Unlimited reviews with annual savings.</p>
          <button className="btn btn-primary w-full">Start Yearly</button>
        </form>
        <form action="/api/stripe/checkout" method="POST" className="card p-5 space-y-3">
          <input type="hidden" name="plan" value="credit" />
          <h2 className="font-serif text-xl font-semibold">$10 one-file</h2>
          <p className="text-sm text-slate">One review credit for occasional files.</p>
          <button className="btn btn-secondary w-full">Buy 1 Credit</button>
        </form>
      </div>

      <div className="card p-6 space-y-2">
        <h2 className="font-serif text-xl font-semibold">Current entitlements</h2>
        <p className="text-sm text-slate">Current entitlement: {entitlement.entitlementLabel}</p>
        <p className="text-sm text-slate">Plan: {billing?.plan_type ? `${billing.plan_type[0].toUpperCase()}${billing.plan_type.slice(1)}` : "No subscription plan"}</p>
        <p className="text-sm text-slate">Subscription status: {billing?.status || "Not subscribed"}</p>
        <p className="text-sm text-slate">Trial remaining: {billing?.trial_remaining ?? 0}</p>
        <p className="text-sm text-slate">Credits balance: {billing?.credits_balance ?? 0}</p>
        <p className="text-sm text-slate">Founder override: {billing?.founder_override ? "Yes" : "No"}</p>
        {entitlement.nearLimitMessage ? (
          <div className="mt-2 rounded-xl border border-[#E9DEBF] bg-[#FFFDF6] p-3 text-sm text-slate">
            {entitlement.nearLimitMessage}
          </div>
        ) : null}
      </div>

      {(isOnboarding && ((billing?.trial_remaining ?? 0) > 0 || billing?.founder_override || billing?.status === "active")) ? (
        <div>
          <Link href="/app/reviews" className="btn btn-secondary">Continue to Reviews</Link>
        </div>
      ) : null}
    </div>
  );
}
