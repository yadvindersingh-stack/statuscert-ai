"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { stageLabel } from "@/lib/statuscert/jobs";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type JobState = {
  id: string;
  status: string;
  stage?: string | null;
  progress?: number;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  lastUpdatedAt?: string | null;
  elapsedMs?: number;
  errorMessage?: string | null;
  result?: {
    downloadUrl?: string | null;
    filesTotal?: number;
    filesProcessed?: number;
    currentFileName?: string;
  } | null;
  filesProcessed?: number | null;
  filesTotal?: number | null;
  currentFileName?: string | null;
  queueDelayed?: boolean;
  jobType?: string;
};

type TransportMode = "realtime" | "poll-fallback";

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function isTerminal(status?: string | null) {
  return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED";
}

function mapDbRowToJob(row: any): JobState {
  const started = row.started_at ? new Date(row.started_at).getTime() : null;
  const completed = row.completed_at ? new Date(row.completed_at).getTime() : null;
  const created = row.created_at ? new Date(row.created_at).getTime() : null;
  const now = Date.now();
  const elapsedMs = started ? Math.max(0, (completed || now) - started) : created ? Math.max(0, now - created) : 0;
  const result = (row.result || null) as JobState["result"];
  return {
    id: row.id,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastUpdatedAt: row.updated_at || null,
    elapsedMs,
    errorMessage: row.error_message || null,
    result,
    filesProcessed: (result?.filesProcessed ?? null) as number | null,
    filesTotal: (result?.filesTotal ?? null) as number | null,
    currentFileName: (result?.currentFileName ?? null) as string | null,
    queueDelayed: row.status === "QUEUED" && elapsedMs > 60000,
    jobType: row.job_type
  };
}

export default function ReviewActions({
  reviewId,
  initialJobId,
  realtimeEnabled,
  canGenerate = true
}: {
  reviewId: string;
  initialJobId?: string | null;
  realtimeEnabled?: boolean;
  canGenerate?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>("Idle");
  const [jobId, setJobId] = useState<string | null>(initialJobId || null);
  const [job, setJob] = useState<JobState | null>(null);
  const [downloadFallbackUrl, setDownloadFallbackUrl] = useState<string | null>(null);
  const [transportMode, setTransportMode] = useState<TransportMode>(realtimeEnabled ? "realtime" : "poll-fallback");
  const [entitlementError, setEntitlementError] = useState<string | null>(null);

  const transportRef = useRef<TransportMode>(realtimeEnabled ? "realtime" : "poll-fallback");
  const jobRef = useRef<JobState | null>(null);
  const realtimeLastEventAtRef = useRef<number>(0);
  const pollDelayRef = useRef<number>(2000);
  const stallEventSentRef = useRef<boolean>(false);
  const completedJobRef = useRef<string | null>(null);

  useEffect(() => {
    transportRef.current = transportMode;
  }, [transportMode]);

  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  useEffect(() => {
    stallEventSentRef.current = false;
    realtimeLastEventAtRef.current = 0;
    pollDelayRef.current = 2000;
    completedJobRef.current = null;
  }, [jobId]);

  const emitUiTelemetry = useCallback(
    async (eventName: string, payload: Record<string, unknown> = {}) => {
      try {
        await fetch("/api/statuscert/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewId, jobId, event: eventName, payload })
        });
      } catch {
        // Best-effort telemetry only.
      }
    },
    [reviewId, jobId]
  );

  const completeJob = useCallback(
    async (nextJob: JobState) => {
      if (isTerminal(nextJob.status)) {
        const completionKey = `${nextJob.id}:${nextJob.status}`;
        if (completedJobRef.current === completionKey) return;
        completedJobRef.current = completionKey;
      }
      if (nextJob.status === "SUCCEEDED") {
        setMessage("Done");
        if (nextJob.result?.downloadUrl) {
          setDownloadFallbackUrl(nextJob.result.downloadUrl);
          window.location.href = nextJob.result.downloadUrl;
          return;
        }
        if (nextJob.jobType === "EXPORT_DOCX") {
          const res = await fetch(`/api/statuscert/reviews/${reviewId}/export/latest`);
          const data = await res.json();
          if (data.ok && data.downloadUrl) {
            setDownloadFallbackUrl(data.downloadUrl);
            window.location.href = data.downloadUrl;
            return;
          }
        }
        router.refresh();
        return;
      }
      if (nextJob.status === "FAILED") {
        setMessage(nextJob.errorMessage || "Failed");
      }
    },
    [reviewId, router]
  );

  const applyJob = useCallback(
    async (nextJob: JobState, source: "poll" | "realtime") => {
      setJob(nextJob);
      if (source === "realtime") {
        realtimeLastEventAtRef.current = Date.now();
        setTransportMode("realtime");
      }
      if (isTerminal(nextJob.status)) {
        await completeJob(nextJob);
      }
    },
    [completeJob]
  );

  const fetchJobOnce = useCallback(async (): Promise<boolean> => {
    if (!jobId) return false;
    try {
      const res = await fetch(`/api/statuscert/jobs/${jobId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok || !data.job) throw new Error("Invalid jobs response");
      await applyJob(data.job as JobState, "poll");
      if (!isTerminal(data.job.status)) {
        setMessage(data.job.status === "QUEUED" ? "Queued" : "Processing");
      }
      if (transportRef.current === "poll-fallback") {
        const normalDelay = (data.job.elapsedMs || 0) > 60000 ? 5000 : 2000;
        pollDelayRef.current = normalDelay;
      } else {
        pollDelayRef.current = 15000;
      }
      return true;
    } catch {
      setTransportMode("poll-fallback");
      pollDelayRef.current = Math.min(10000, Math.max(2000, pollDelayRef.current * 2));
      return false;
    }
  }, [applyJob, jobId]);

  async function run(endpoint: string, body: Record<string, unknown>, pendingMessage: string) {
    setMessage(pendingMessage);
    setDownloadFallbackUrl(null);
    setEntitlementError(null);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.ok) {
      if (data.code === "ENTITLEMENT_REQUIRED") {
        setEntitlementError("Free trial is complete. Choose a plan or buy a one-file credit to continue.");
        setMessage("Action required");
        return null;
      }
      setMessage(data.error || "Error");
      return null;
    }
    if (data.completed) {
      setMessage("Done");
      if (data.downloadUrl) {
        setDownloadFallbackUrl(data.downloadUrl);
        window.location.href = data.downloadUrl;
      } else {
        router.refresh();
      }
      return null;
    }
    if (data.jobId) {
      setJobId(data.jobId);
      setTransportMode(realtimeEnabled ? "realtime" : "poll-fallback");
      setMessage("Queued");
      return data.jobId as string;
    }
    setMessage("Done");
    return null;
  }

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      if (cancelled || !jobId) return;
      const ok = await fetchJobOnce();
      if (cancelled) return;
      if (jobRef.current && isTerminal(jobRef.current.status)) return;
      const nextDelay = ok ? pollDelayRef.current : Math.min(10000, pollDelayRef.current);
      timeout = setTimeout(loop, nextDelay);
    };

    loop();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [fetchJobOnce, jobId]);

  useEffect(() => {
    if (!jobId || !realtimeEnabled) return;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`status-cert-job-${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "status_cert_jobs", filter: `id=eq.${jobId}` },
        (payload) => {
          const nextJob = mapDbRowToJob(payload.new);
          void applyJob(nextJob, "realtime");
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          realtimeLastEventAtRef.current = Date.now();
          setTransportMode("realtime");
          pollDelayRef.current = 15000;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setTransportMode("poll-fallback");
          pollDelayRef.current = 2000;
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyJob, jobId, realtimeEnabled]);

  useEffect(() => {
    if (!jobId || !realtimeEnabled) return;
    const interval = setInterval(() => {
      if (!job || isTerminal(job.status)) return;
      if (transportRef.current !== "realtime") return;
      const sinceLastRealtime = Date.now() - (realtimeLastEventAtRef.current || 0);
      if (sinceLastRealtime > 20000) {
        setTransportMode("poll-fallback");
        pollDelayRef.current = 2000;
        if (!stallEventSentRef.current) {
          stallEventSentRef.current = true;
          void emitUiTelemetry("job_ui_stall_detected", { sinceLastRealtimeMs: sinceLastRealtime, jobStatus: job.status });
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [emitUiTelemetry, job, jobId, realtimeEnabled]);

  const running = useMemo(() => {
    if (!job) return false;
    return job.status === "QUEUED" || job.status === "RUNNING";
  }, [job]);

  const displayProgress = useMemo(() => {
    if (!job) return 0;
    if (job.status === "QUEUED") {
      const elapsedSeconds = Math.max(0, Math.floor((job.elapsedMs || 0) / 1000));
      return Math.min(9, Math.max(1, Math.floor(elapsedSeconds / 6) + 1));
    }
    if (job.status === "RUNNING") {
      return Math.max(10, Math.min(100, job.progress ?? 10));
    }
    return Math.max(0, Math.min(100, job.progress ?? 0));
  }, [job]);

  async function retryGenerate() {
    const id = await run("/api/statuscert/generate-draft", { reviewId }, "Preparing your draft...");
    if (id) setJobId(id);
  }

  return (
    <div className="space-y-3">
      <button
        className="btn btn-secondary w-full disabled:opacity-60"
        disabled={!canGenerate}
        onClick={() => run("/api/statuscert/generate-draft", { reviewId }, "Preparing your draft...")}
      >
        Generate Draft
      </button>
      <button
        className="btn btn-secondary w-full disabled:opacity-60"
        disabled={!canGenerate}
        onClick={() => run("/api/statuscert/export", { reviewId }, "Building DOCX...")}
      >
        Export DOCX
      </button>
      {running ? (
        <div className="rounded-xl border border-[#E6E2D9] bg-[#FBF9F5] p-3">
          <p className="text-xs text-slate">Stage: {stageLabel(job?.stage)}</p>
          <p className="text-xs text-slate">Progress: {displayProgress}%</p>
          <div className="mt-2 h-2 w-full rounded-full bg-[#E6E2D9]">
            <div className="h-2 rounded-full bg-ink transition-all" style={{ width: `${displayProgress}%` }} />
          </div>
          {job?.status === "QUEUED" ? (
            <p className="mt-2 text-xs text-slate">Your package is queued and processing will start shortly.</p>
          ) : null}
          {(job?.result?.filesTotal || job?.filesTotal) ? (
            <p className="mt-2 text-xs text-slate">
              Processing file {job?.result?.filesProcessed || job?.filesProcessed || 0} of {job?.result?.filesTotal || job?.filesTotal}
              {(job?.result?.currentFileName || job?.currentFileName) ? `: ${job?.result?.currentFileName || job?.currentFileName}` : ""}
            </p>
          ) : null}
          <p className="text-xs text-slate">Elapsed: {formatElapsed(job?.elapsedMs || 0)}</p>
          {job?.status === "QUEUED" && job?.queueDelayed ? (
            <p className="mt-1 text-xs text-slate">This is taking longer than usual. We&apos;ll continue processing in the background.</p>
          ) : null}
          <p className="mt-1 text-xs text-slate">
            We&apos;re processing this package in the background. You can continue working and check back shortly.
          </p>
        </div>
      ) : null}
      {job?.status === "FAILED" ? (
        <button className="btn btn-secondary w-full" onClick={retryGenerate}>
          Retry Generate
        </button>
      ) : null}
      {downloadFallbackUrl ? (
        <a className="btn btn-secondary w-full text-center" href={downloadFallbackUrl}>
          Download DOCX
        </a>
      ) : null}
      {entitlementError ? (
        <div className="rounded-xl border border-[#E6D1B8] bg-[#FFF8EE] p-3 text-xs text-slate">
          <p>{entitlementError}</p>
          <Link className="mt-2 inline-block underline text-ink" href="/app/billing?source=gate">
            Go to Billing
          </Link>
        </div>
      ) : null}
      <p className="text-xs text-slate">{message}</p>
    </div>
  );
}
