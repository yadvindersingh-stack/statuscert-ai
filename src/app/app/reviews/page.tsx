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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Status Certificate</p>
          <h1 className="font-serif text-3xl font-semibold">Reviews</h1>
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

      <div className="card p-6">
        <div className="grid gap-4">
          {reviews?.length ? (
            reviews.map((review) => (
              <Link key={review.id} href={`/app/reviews/${review.id}`} className="rounded-xl border border-[#E6E2D9] p-4 hover:border-ink transition">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{review.title}</h3>
                    <p className="text-xs text-slate">{new Date(review.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="badge bg-[#EEE6D7] text-slate">{mapReviewStatus(review.status)}</span>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-slate">No reviews yet. Create your first status certificate review.</p>
          )}
        </div>
      </div>
    </div>
  );
}
