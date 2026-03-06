import { requireFirmId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import ReviewActions from "@/components/ReviewActions";
import ReviewEditor from "@/components/ReviewEditor";
import { mapReviewStatus } from "@/lib/statuscert/jobs";
import { canonicalizeReviewSections, sectionsToReviewText } from "@/lib/statuscert/editor";
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

  const normalizedTitle = String(review.title || "")
    .replace(/,\s*during normal business hours.*$/i, "")
    .replace(/\bprovided a request is in writing.*$/i, "")
    .replace(/\b(unit\s*#?\s*\d+)\s*-\s*(.*\bunit\s*#?\s*\d+\b.*)/i, "$2")
    .replace(/\bunit\s*#?\s*(\d+)\b/i, "Unit $1")
    .replace(/\s{2,}/g, " ")
    .trim();
  const reviewTitle = normalizedTitle || "Status Certificate";
  if (review.title !== reviewTitle) {
    await supabase
      .from("status_cert_reviews")
      .update({ title: reviewTitle, updated_at: new Date().toISOString() })
      .eq("id", review.id)
      .eq("firm_id", firmId);
    review.title = reviewTitle;
  }

  const storedReviewText = String(review.review_text || "");
  const canonicalSections = canonicalizeReviewSections(review.review_sections_json || [], storedReviewText || null);
  const sections = canonicalSections as Array<{ content?: string }>;
  const hasGeneratedSections = sections.some((section) => (section.content || "").trim().length > 0);
  const fallbackReviewText = hasGeneratedSections ? sectionsToReviewText(canonicalSections) : "";
  const reviewText = storedReviewText.trim() ? storedReviewText : fallbackReviewText;
  const flags = review.flags_json || [];
  const missingFields = (Array.isArray(review.extracted_json?.missing_fields) ? review.extracted_json.missing_fields : []).filter((field: string) =>
    ["corporation_name", "common_expenses", "special_assessments", "legal_proceedings", "fee_increases"].includes(field)
  );
  const visibleFlags = flags
    .filter((flag: any) => !(typeof flag?.key === "string" && flag.key.startsWith("missing_")))
    .filter((flag: any) => {
      const title = String(flag?.title || "").toLowerCase();
      return !(
        title.includes("unusual clause to review: no mention") ||
        title.includes("unusual clause to review: no explicit") ||
        title.includes("unusual clause to review: not found")
      );
    })
    .filter((flag: any, index: number, arr: any[]) => {
      const key = String(flag?.key || "").toLowerCase();
      const title = String(flag?.title || "").toLowerCase();
      return (
        arr.findIndex((item) => {
          const itemKey = String(item?.key || "").toLowerCase();
          const itemTitle = String(item?.title || "").toLowerCase();
          return itemKey === key || itemTitle === title;
        }) === index
      );
    });
  const displayStatus =
    activeJob?.status === "QUEUED"
      ? "QUEUED"
      : activeJob?.status === "RUNNING"
      ? "PROCESSING"
      : mapReviewStatus(review.status);
  const realtimeUiEnabled = process.env.STATUSCERT_REALTIME_UI === "true";
  const entitlement = await getFirmEntitlement(firmId, user.email);
  const severityTone = (severity: string) => {
    const key = String(severity || "").toUpperCase();
    if (key === "HIGH") return "bg-[#FDE8E8] text-[#991B1B]";
    if (key === "MED") return "bg-[#FEF3C7] text-[#92400E]";
    return "bg-[#E8EEF7] text-[var(--primary)]";
  };
  const splitLayoutClass = "lg:grid-cols-[minmax(0,1.7fr)_minmax(360px,0.9fr)]";

  return (
    <div className={`grid gap-6 ${splitLayoutClass} lg:items-start`}>
      <div className="space-y-6">
        <div>
          <p className="section-title">Review Status</p>
          <h1 className="font-serif text-4xl font-semibold leading-tight">{reviewTitle}</h1>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1">
            <span className="text-xs uppercase tracking-[0.12em] text-slate">Status</span>
            <span className="text-xs font-semibold text-ink">{displayStatus}</span>
          </div>
        </div>

        {reviewText.trim() ? (
          <ReviewEditor reviewId={review.id} initialText={reviewText} />
        ) : (
          <div className="card min-h-[220px] p-7">
            <h2 className="font-serif text-2xl font-semibold">Review Draft</h2>
            {activeJob ? (
              <p className="mt-3 text-sm text-slate">
                Your draft is being generated in the background and will appear here once processing completes.
              </p>
            ) : docs?.length ? (
              <p className="mt-3 text-sm text-slate">
                Your package is uploaded. Click <span className="font-semibold text-ink">Generate Draft</span> to start drafting.
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate">
                Upload your status certificate package, then click <span className="font-semibold text-ink">Generate Draft</span>.
              </p>
            )}
          </div>
        )}
      </div>

      <aside className="space-y-6 lg:sticky lg:top-24">
        <div className="card p-5">
          {!entitlement.allowed ? (
            <div className="mb-4 rounded-xl border border-[#E6D1B8] bg-[#FFF8EE] p-3 text-xs text-slate">
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

        <div className="card p-6">
          <h2 className="font-serif text-2xl font-semibold">Flags</h2>
          {missingFields.length ? (
            <div className="mt-4 rounded-xl border border-[#E9DEBF] bg-[#FFFDF6] p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate">Missing Information</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate">
                {missingFields.map((field: string) => (
                  <li key={field}>{field}: Not found in provided documents</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            {visibleFlags.length ? (
              visibleFlags.map((flag: any) => (
                <div key={flag.key} className="rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{flag.title}</h3>
                    <span className={`badge ${severityTone(flag.severity)}`}>{flag.severity}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate">{flag.why_it_matters}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate">No flags yet.</p>
            )}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-serif text-2xl font-semibold">Latest export</h2>
          <div className="mt-3 space-y-2">
            {latestExportUrl ? (
              <a href={latestExportUrl} className="text-sm underline text-ink">Download latest DOCX</a>
            ) : (
              <p className="text-sm text-slate">No export yet.</p>
            )}
          </div>
        </div>

        <div className="card p-6">
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

        <div className="card p-6">
          <details>
            <summary className="cursor-pointer font-serif text-xl font-semibold">Advanced: Source data</summary>
            <pre className="mt-4 max-h-[320px] overflow-auto rounded-xl bg-[#FBF9F5] p-4 text-xs text-slate">
{JSON.stringify(review.extracted_json, null, 2)}
            </pre>
          </details>
        </div>
      </aside>
    </div>
  );
}
