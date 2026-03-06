import Link from "next/link";
import { requireFirmId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapReviewStatus } from "@/lib/statuscert/jobs";
import { getFirmEntitlement } from "@/lib/billing";

export default async function ReviewsPage() {
  const { firmId, user } = await requireFirmId();
  const supabase = createServerSupabaseClient();
  const entitlement = await getFirmEntitlement(firmId, user.email);

  const { data: reviews } = await supabase
    .from("status_cert_reviews")
    .select("id, title, status, created_at")
    .eq("firm_id", firmId)
    .order("created_at", { ascending: false });

  const displayTitle = (title: string) =>
    String(title || "")
      .replace(/,\s*during normal business hours.*$/i, "")
      .replace(/\bprovided a request is in writing.*$/i, "")
      .replace(/\b(unit\s*#?\s*\d+)\s*-\s*(.*\bunit\s*#?\s*\d+\b.*)/i, "$2")
      .replace(/\bunit\s*#?\s*(\d+)\b/i, "Unit $1")
      .replace(/\s{2,}/g, " ")
      .trim() || "Status Certificate";

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="section-title">Workspace</p>
          <h1 className="font-serif text-3xl font-semibold">Reviews</h1>
          <p className="mt-2 text-sm text-slate">Track every status certificate draft from upload through export.</p>
        </div>
        <Link href="/app/reviews/new" className="btn btn-primary">New review</Link>
      </div>
      {!entitlement.allowed ? (
        <div className="rounded-xl border border-[#E6D1B8] bg-[#FFF8EE] p-4 text-sm text-slate">
          No active entitlement remaining. Choose a plan or buy a one-file credit to continue generating drafts and exporting DOCX.
          <Link href="/app/billing?source=gate" className="ml-1 underline text-ink">Go to Billing</Link>
        </div>
      ) : entitlement.entitlementType === "TRIAL" ? (
        <div className="rounded-xl border border-[#E9DEBF] bg-[#FFFDF6] p-4 text-sm text-slate">
          Current entitlement: {entitlement.entitlementLabel}.
          <Link href="/app/billing?source=trial-warning" className="ml-1 underline text-ink">View plans</Link>
        </div>
      ) : entitlement.entitlementType === "CREDITS" ? (
        <div className="rounded-xl border border-[#E9DEBF] bg-[#FFFDF6] p-4 text-sm text-slate">
          Current entitlement: {entitlement.entitlementLabel}.
          <Link href="/app/billing?source=credits-warning" className="ml-1 underline text-ink">Buy more credits</Link>
        </div>
      ) : entitlement.entitlementType === "MONTHLY" || entitlement.entitlementType === "YEARLY" ? (
        <div className="rounded-xl border border-[#D8E4F3] bg-[#F4F8FD] p-4 text-sm text-slate">
          Current entitlement: {entitlement.entitlementLabel}.
        </div>
      ) : entitlement.entitlementType === "FOUNDER" ? (
        <div className="rounded-xl border border-[#D8E4F3] bg-[#F4F8FD] p-4 text-sm text-slate">
          Current entitlement: {entitlement.entitlementLabel}.
        </div>
      ) : null}
      {entitlement.allowed && entitlement.nearLimitMessage ? (
        <div className="rounded-xl border border-[#E9DEBF] bg-[#FFFDF6] p-4 text-sm text-slate">
          {entitlement.nearLimitMessage}
          <Link href="/app/billing?source=limit-warning" className="ml-1 underline text-ink">Manage billing</Link>
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4">
          <div className="grid grid-cols-[1.8fr_0.7fr_0.6fr] text-xs uppercase tracking-[0.14em] text-slate">
            <span>Review</span>
            <span>Created</span>
            <span>Status</span>
          </div>
        </div>
        <div className="grid">
          {reviews?.length ? (
            reviews.map((review) => (
              <Link
                key={review.id}
                href={`/app/reviews/${review.id}`}
                className="grid grid-cols-[1.8fr_0.7fr_0.6fr] items-center gap-4 border-b border-[var(--border)] px-6 py-4 transition hover:bg-[#F8FAFD]"
              >
                <div>
                  <h3 className="font-semibold text-ink">{displayTitle(review.title)}</h3>
                  <p className="mt-1 text-xs text-slate">Open review</p>
                </div>
                <p className="text-sm text-slate">{new Date(review.created_at).toLocaleDateString()}</p>
                <span className="badge w-fit bg-[#EEF2F8] text-[var(--primary)]">{mapReviewStatus(review.status)}</span>
              </Link>
            ))
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate">No reviews yet. Create your first status certificate review.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
