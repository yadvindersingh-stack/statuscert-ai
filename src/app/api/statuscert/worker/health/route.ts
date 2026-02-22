import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  await requireUser();
  const admin = createServiceSupabaseClient();

  const nowIso = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const queueWarnMs = Number(process.env.STATUSCERT_QUEUE_WARN_MS || 30_000);
  const queueCriticalMs = Number(process.env.STATUSCERT_QUEUE_CRITICAL_MS || 120_000);
  const recentCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const [{ count: queued }, { count: running }, { data: oldestQueued }, { count: staleRunning }, { count: recentSucceeded }, { count: recentFailed }] = await Promise.all([
    admin.from('status_cert_jobs').select('*', { count: 'exact', head: true }).eq('status', 'QUEUED'),
    admin.from('status_cert_jobs').select('*', { count: 'exact', head: true }).eq('status', 'RUNNING'),
    admin
      .from('status_cert_jobs')
      .select('created_at')
      .eq('status', 'QUEUED')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin.from('status_cert_jobs').select('*', { count: 'exact', head: true }).eq('status', 'RUNNING').lt('updated_at', staleCutoff),
    admin.from('status_cert_jobs').select('*', { count: 'exact', head: true }).eq('status', 'SUCCEEDED').gte('completed_at', recentCutoff),
    admin.from('status_cert_jobs').select('*', { count: 'exact', head: true }).eq('status', 'FAILED').gte('completed_at', recentCutoff)
  ]);

  const oldestQueuedMs = oldestQueued?.created_at ? Date.now() - new Date(oldestQueued.created_at).getTime() : 0;
  const queueState = oldestQueuedMs >= queueCriticalMs ? 'critical' : oldestQueuedMs >= queueWarnMs ? 'warn' : 'ok';

  return NextResponse.json({
    ok: true,
    now: nowIso,
    queued: queued || 0,
    running: running || 0,
    oldestQueuedMs,
    queueState,
    queueWarnMs,
    queueCriticalMs,
    staleRunning: staleRunning || 0,
    completedLast5m: recentSucceeded || 0,
    failedLast5m: recentFailed || 0
  });
}
