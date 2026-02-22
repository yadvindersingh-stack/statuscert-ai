import { NextResponse } from "next/server";

export const runtime = "nodejs";
import { requireFirmId } from "@/lib/auth";
import { enqueueStatusCertJob } from "@/lib/statuscert/queue";
import { getStatusCertExecutionMode } from "@/lib/statuscert/execution";
import { runExportDocxJob } from "@/lib/statuscert/pipeline";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getFirmEntitlement } from "@/lib/billing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { firmId, user } = await requireFirmId();
  const { reviewId } = await request.json();
  const executionMode = getStatusCertExecutionMode();

  if (!reviewId) {
    return NextResponse.json({ ok: false, error: "reviewId is required" }, { status: 400 });
  }

  const entitlement = await getFirmEntitlement(firmId, user.email);
  if (!entitlement.allowed) {
    const supabase = createServerSupabaseClient();
    await supabase.from("status_cert_events").insert({
      firm_id: firmId,
      review_id: reviewId,
      actor_id: user.id,
      event_type: "entitlement_blocked",
      payload: {
        action: "EXPORT_DOCX",
        reason: entitlement.reason,
        trialRemaining: entitlement.trialRemaining,
        creditsBalance: entitlement.creditsBalance
      }
    });
    return NextResponse.json(
      {
        ok: false,
        code: "ENTITLEMENT_REQUIRED",
        reason: entitlement.reason,
        trialRemaining: entitlement.trialRemaining,
        creditsBalance: entitlement.creditsBalance,
        billingUrl: "/app/billing?source=gate"
      },
      { status: 402 }
    );
  }

  const { job, created } = await enqueueStatusCertJob({
    firmId,
    reviewId,
    jobType: "EXPORT_DOCX"
  });

  if (executionMode === "inline" && (created || job.status === "QUEUED")) {
    const admin = createServiceSupabaseClient();
    const { data: freshJob } = await admin.from("status_cert_jobs").select("*").eq("id", job.id).single();
    if (freshJob) {
      await runExportDocxJob(freshJob);
      const { data: completedJob } = await admin.from("status_cert_jobs").select("result").eq("id", job.id).single();
      const downloadUrl = (completedJob?.result as any)?.downloadUrl || null;
      return NextResponse.json({ ok: true, status: "SUCCEEDED", executionMode, completed: true, jobId: job.id, downloadUrl });
    }
  }

  return NextResponse.json({ ok: true, status: "QUEUED", executionMode, completed: false, jobId: job.id, job });
}
