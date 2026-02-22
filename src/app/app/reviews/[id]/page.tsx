import { requireFirmId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import ReviewActions from "@/components/ReviewActions";
import ReviewEditor from "@/components/ReviewEditor";
import { DEFAULT_TEMPLATE } from "@/lib/statuscert/templates";
import { mapReviewStatus } from "@/lib/statuscert/jobs";
import { sectionsToReviewText } from "@/lib/statuscert/editor";
import { getFirmEntitlement } from "@/lib/billing";
import Link from "next/link";

export default async function ReviewDetailPage({ params }: { params: { id: string } }) {
  const { firmId, user } = await requireFirmId();
  const supabase = createServerSupabaseClient();
  const admin = createServiceSupabaseClient();

  const { data: review } = await supabase
    .from("status_cert_reviews")
    .select("*, status_cert_templates(title, template_json)")
    .eq("id", params.id)
    .eq("firm_id", firmId)
    .single();

  const { data: docs } = await supabase
    .from("status_cert_review_documents")
    .select("file_name, file_path, created_at")
    .eq("firm_id", firmId)
    .eq("review_id", params.id)
    .order("created_at", { ascending: true });

  const { data: activeJob } = await supabase
    .from("status_cert_jobs")
    .select("id, status, stage")
    .eq("firm_id", firmId)
    .eq("review_id", params.id)
    .in("status", ["QUEUED", "RUNNING"])
    .order("created_at", { ascending: false })
    .maybeSingle();

  let latestExportUrl: string | null = null;
  if (review?.exported_doc_path) {
    const { data } = await admin.storage.from("documents").createSignedUrl(review.exported_doc_path, 60 * 60);
    latestExportUrl = data?.signedUrl || null;
  }

  if (!review) {
    return <div className="text-sm text-slate">Review not found.</div>;
  }

  const template = review.status_cert_templates?.template_json || DEFAULT_TEMPLATE;
  const sections = review.review_sections_json || template.sections;
  const reviewText = review.review_text || sectionsToReviewText(sections);
  if (!review.review_text && reviewText.trim()) {
    await supabase
      .from("status_cert_reviews")
      .update({ review_text: reviewText, updated_at: new Date().toISOString() })
      .eq("id", review.id)
      .eq("firm_id", firmId);
  }
  const flags = review.flags_json || [];
  const missingFields = Array.isArray(review.extracted_json?.missing_fields) ? review.extracted_json.missing_fields : [];
  const displayStatus =
    activeJob?.status === "QUEUED"
      ? "QUEUED"
      : activeJob?.status === "RUNNING"
      ? "PROCESSING"
      : mapReviewStatus(review.status);
  const realtimeUiEnabled = process.env.STATUSCERT_REALTIME_UI === "true";
  const entitlement = await getFirmEntitlement(firmId, user.email);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="section-title">Review status</p>
          <h1 className="font-serif text-3xl font-semibold">{review.title}</h1>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#E6E2D9] bg-white px-3 py-1">
            <span className="text-xs uppercase tracking-[0.12em] text-slate">Status</span>
            <span className="text-xs font-semibold text-ink">{displayStatus}</span>
          </div>
        </div>
        <div className="card p-4">
          {!entitlement.allowed ? (
            <div className="mb-3 rounded-xl border border-[#E6D1B8] bg-[#FFF8EE] p-3 text-xs text-slate">
              No active entitlement remaining. Choose a plan or buy a one-file credit to continue generating and exporting.
              <Link className="ml-1 underline text-ink" href="/app/billing?source=gate">Go to Billing</Link>
            </div>
          ) : null}
          <ReviewActions
            reviewId={review.id}
            initialJobId={activeJob?.id || null}
            realtimeEnabled={realtimeUiEnabled}
            canGenerate={entitlement.allowed}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <ReviewEditor reviewId={review.id} initialText={reviewText} />
        </div>
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="font-serif text-xl font-semibold">Flags</h2>
            {missingFields.length ? (
              <div className="mt-4 rounded-xl border border-[#E9DEBF] bg-[#FFFDF6] p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate">Missing info detected</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-slate">
                  {missingFields.map((field: string) => (
                    <li key={field}>{field}: Not found in provided documents</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              {flags.length ? (
                flags.map((flag: any) => (
                  <div key={flag.key} className="rounded-xl border border-[#E6E2D9] p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{flag.title}</h3>
                      <span className="badge bg-[#F5E1D2] text-warn">{flag.severity}</span>
                    </div>
                    <p className="text-sm text-slate mt-2">{flag.why_it_matters}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate">No flags yet.</p>
              )}
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-serif text-xl font-semibold">Latest export</h2>
            <div className="mt-3 space-y-2">
              {latestExportUrl ? (
                <a href={latestExportUrl} className="text-sm underline text-ink">Download latest DOCX</a>
              ) : (
                <p className="text-sm text-slate">No export yet.</p>
              )}
            </div>
          </div>
          <div className="card p-5">
            <details>
              <summary className="cursor-pointer font-serif text-xl font-semibold">Advanced: Uploaded package</summary>
              <div className="mt-3 space-y-2">
                {docs?.length ? (
                  docs.map((doc) => (
                    <p key={doc.file_path} className="text-sm text-slate">{doc.file_name}</p>
                  ))
                ) : (
                  <p className="text-sm text-slate">No package files listed.</p>
                )}
              </div>
            </details>
          </div>
          <div className="card p-5">
            <details>
              <summary className="cursor-pointer font-serif text-xl font-semibold">Advanced: Source data</summary>
              <pre className="mt-4 max-h-[320px] overflow-auto rounded-xl bg-[#FBF9F5] p-4 text-xs text-slate">
{JSON.stringify(review.extracted_json, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
