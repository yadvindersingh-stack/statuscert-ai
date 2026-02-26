import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireFirmId } from "@/lib/auth";
import ReviewUploadForm from "@/components/ReviewUploadForm";
import FormSubmitButton from "@/components/FormSubmitButton";

async function createReviewAction(formData: FormData) {
  "use server";
  const { firmId, user } = await requireFirmId();
  const supabase = createServerSupabaseClient();
  const title = String(formData.get("title") || "").trim();
  const { data: preferredTemplate } = await supabase
    .from("status_cert_templates")
    .select("id")
    .or(`and(firm_id.eq.${firmId},is_default.eq.true),and(firm_id.is.null,is_default.eq.true)`)
    .order("firm_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: review, error } = await supabase
    .from("status_cert_reviews")
    .insert({
      firm_id: firmId,
      created_by: user.id,
      title: title || "Untitled Status Certificate",
      status: "DRAFT",
      template_id: preferredTemplate?.id || null
    })
    .select("id")
    .single();

  if (error || !review?.id) {
    redirect(`/app/reviews/new?error=${encodeURIComponent("Unable to create review. Please try again.")}`);
  }

  redirect(`/app/reviews/new?reviewId=${review.id}`);
}

export default async function NewReviewPage({
  searchParams
}: {
  searchParams?: { reviewId?: string; error?: string };
}) {
  const { firmId } = await requireFirmId();
  const supabase = createServerSupabaseClient();
  const reviewId = searchParams?.reviewId || null;

  let reviewTitle = "";
  if (reviewId) {
    const { data: review } = await supabase
      .from("status_cert_reviews")
      .select("id, title")
      .eq("firm_id", firmId)
      .eq("id", reviewId)
      .maybeSingle();
    reviewTitle = review?.title || "";
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="section-title">Create review</p>
        <h1 className="font-serif text-3xl font-semibold">Upload status certificate package</h1>
      </div>

      {searchParams?.error ? (
        <div className="rounded-xl border border-[#E6D1B8] bg-[#FFF8EE] p-4 text-sm text-slate">{searchParams.error}</div>
      ) : null}

      {!reviewId ? (
        <form action={createReviewAction} className="card p-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate">Review name (optional)</label>
            <input
              name="title"
              type="text"
              placeholder="Example: Unit 302 - St. Nicholas - Purchase"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-2"
            />
            <p className="mt-2 text-xs text-slate">If blank, we will auto-name after extraction using unit/address and timestamp.</p>
          </div>
          <FormSubmitButton className="btn btn-primary" idleLabel="Create review" pendingLabel="Creating..." />
        </form>
      ) : (
        <div className="card p-6 space-y-4">
          <p className="text-sm text-slate">Review: <span className="font-semibold text-ink">{reviewTitle || "Untitled Status Certificate"}</span></p>
          <ReviewUploadForm firmId={firmId} reviewId={reviewId} />
        </div>
      )}
    </div>
  );
}
