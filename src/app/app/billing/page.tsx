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
    <div className="space-y-8">
      <div>
        <p className="section-title">Billing</p>
        <h1 className="font-serif text-3xl font-semibold">Choose your plan</h1>
        <p className="mt-2 text-sm text-slate">Monthly and yearly unlimited plans, or one-file credits for occasional matters.</p>
      </div>

      {isOnboarding ? (
        <div className="rounded-xl border border-[#E9DEBF] bg-[#FFFDF6] p-4 text-sm text-slate">
          Set up billing now so generation and export continue after your trial ends.
        </div>
      ) : null}
      {searchParams?.success === "true" ? (
        <div className="rounded-xl border border-[#C7D9CC] bg-[#F2FAF4] p-4 text-sm text-[#1E5B2B]">Billing updated successfully.</div>
      ) : null}
      {searchParams?.canceled === "true" ? (
        <div className="rounded-xl border border-[#E6D1B8] bg-[#FFF8EE] p-4 text-sm text-slate">Checkout canceled. No billing changes were made.</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <form action="/api/stripe/checkout" method="POST" className="card p-6 space-y-4">
          <input type="hidden" name="plan" value="monthly" />
          <p className="text-xs uppercase tracking-[0.14em] text-slate">Monthly</p>
          <h2 className="font-serif text-2xl font-semibold">$50<span className="text-sm font-normal text-slate"> / month</span></h2>
          <p className="text-sm text-slate">Unlimited status certificate reviews for active files.</p>
          <button className="btn btn-primary w-full">Start Monthly</button>
        </form>
        <form action="/api/stripe/checkout" method="POST" className="card p-6 space-y-4">
          <input type="hidden" name="plan" value="yearly" />
          <p className="text-xs uppercase tracking-[0.14em] text-slate">Yearly</p>
          <h2 className="font-serif text-2xl font-semibold">$500<span className="text-sm font-normal text-slate"> / year</span></h2>
          <p className="text-sm text-slate">Unlimited reviews with annual savings.</p>
          <button className="btn btn-primary w-full">Start Yearly</button>
        </form>
        <form action="/api/stripe/checkout" method="POST" className="card p-6 space-y-4">
          <input type="hidden" name="plan" value="credit" />
          <p className="text-xs uppercase tracking-[0.14em] text-slate">One-file credit</p>
          <h2 className="font-serif text-2xl font-semibold">$10<span className="text-sm font-normal text-slate"> one-time</span></h2>
          <p className="text-sm text-slate">One review credit for occasional files.</p>
          <button className="btn btn-secondary w-full">Buy 1 Credit</button>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="font-serif text-2xl font-semibold">Current entitlements</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate">Current access</p>
            <p className="mt-2 text-sm font-semibold text-ink">{entitlement.entitlementLabel}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate">Subscription</p>
            <p className="mt-2 text-sm text-ink">{billing?.status === "active" ? "Active" : "Not subscribed"}</p>
            <p className="mt-1 text-xs text-slate">
              {billing?.plan_type ? `${billing.plan_type[0].toUpperCase()}${billing.plan_type.slice(1)} plan` : "No recurring plan"}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate">Usage balance</p>
            <p className="mt-2 text-sm text-ink">Trial remaining: {billing?.trial_remaining ?? 0}</p>
            <p className="mt-1 text-sm text-ink">Credits: {billing?.credits_balance ?? 0}</p>
          </div>
        </div>
        {billing?.founder_override ? (
          <p className="mt-3 text-xs text-slate">Founder override is enabled for this account.</p>
        ) : null}
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
