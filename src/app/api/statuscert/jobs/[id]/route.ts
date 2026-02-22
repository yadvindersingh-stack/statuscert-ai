import { NextResponse } from 'next/server';
import { requireFirmId } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { firmId } = await requireFirmId();
  const supabase = createServerSupabaseClient();

  const { data: job } = await supabase
    .from('status_cert_jobs')
    .select('id, status, stage, progress, started_at, completed_at, created_at, updated_at, error_message, result, review_id, job_type')
    .eq('id', params.id)
    .eq('firm_id', firmId)
    .single();

  if (!job) {
    return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });
  }

  const startedAt = job.started_at ? new Date(job.started_at).getTime() : null;
  const createdAt = job.created_at ? new Date(job.created_at).getTime() : null;
  const endedAt = job.completed_at ? new Date(job.completed_at).getTime() : null;
  const now = Date.now();
  const elapsedMs = startedAt
    ? Math.max(0, (endedAt || now) - startedAt)
    : createdAt
    ? Math.max(0, now - createdAt)
    : 0;
  const queueDelayed = job.status === 'QUEUED' && elapsedMs > 60000;
  const uiHint = job.status === 'QUEUED' || job.status === 'RUNNING' ? 'background_processing' : null;

  return NextResponse.json({
    ok: true,
    job: {
      id: job.id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      startedAt: job.started_at,
      createdAt: job.created_at,
      completedAt: job.completed_at,
      lastUpdatedAt: job.updated_at,
      elapsedMs,
      errorMessage: job.error_message,
      result: job.result,
      filesProcessed: (job.result as any)?.filesProcessed ?? null,
      filesTotal: (job.result as any)?.filesTotal ?? null,
      currentFileName: (job.result as any)?.currentFileName ?? null,
      reviewId: job.review_id,
      jobType: job.job_type,
      queueDelayed,
      uiHint
    }
  });
}
