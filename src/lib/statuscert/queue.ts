import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ACTIVE_JOB_STATUSES, StatusCertJobType } from './jobs';

export async function enqueueStatusCertJob(input: {
  firmId: string;
  reviewId: string;
  jobType: StatusCertJobType;
  payload?: Record<string, unknown>;
}) {
  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from('status_cert_jobs')
    .select('id, firm_id, review_id, payload, attempt_count, status, stage, progress, started_at, created_at, result, error_message')
    .eq('firm_id', input.firmId)
    .eq('review_id', input.reviewId)
    .eq('job_type', input.jobType)
    .in('status', ACTIVE_JOB_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { job: existing, created: false };
  }

  const { data: created, error } = await supabase
    .from('status_cert_jobs')
    .insert({
      firm_id: input.firmId,
      review_id: input.reviewId,
      job_type: input.jobType,
      status: 'QUEUED',
      stage: 'VALIDATING',
      progress: 1,
      payload: input.payload || null
    })
    .select('id, firm_id, review_id, payload, attempt_count, status, stage, progress, started_at, created_at, result, error_message')
    .single();

  if (error) throw new Error(error.message);
  return { job: created, created: true };
}
