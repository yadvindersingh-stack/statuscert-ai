"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin_1 = require("../lib/supabase/admin");
const pipeline_1 = require("../lib/statuscert/pipeline");
const POLL_MS = Number(process.env.STATUSCERT_WORKER_POLL_MS || 2000);
const IDLE_LOG_EVERY = Number(process.env.STATUSCERT_WORKER_IDLE_LOG_EVERY || 30);
const STALE_RUNNING_MS = Number(process.env.STATUSCERT_WORKER_STALE_RUNNING_MS || 5 * 60 * 1000);
const WORKER_CONCURRENCY = Math.max(1, Number(process.env.STATUSCERT_WORKER_CONCURRENCY || 2));
async function claimNextJob() {
    const admin = (0, admin_1.createServiceSupabaseClient)();
    const { data, error } = await admin.rpc('claim_next_status_cert_job');
    if (error) {
        throw new Error(error.message);
    }
    if (Array.isArray(data))
        return data[0] || null;
    return data || null;
}
async function markStaleRunningJobs() {
    const admin = (0, admin_1.createServiceSupabaseClient)();
    const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
    const { data: staleJobs } = await admin
        .from('status_cert_jobs')
        .select('id, review_id, firm_id')
        .eq('status', 'RUNNING')
        .lt('updated_at', cutoff)
        .limit(25);
    if (!staleJobs?.length)
        return;
    for (const job of staleJobs) {
        await admin
            .from('status_cert_jobs')
            .update({
            status: 'FAILED',
            error_message: 'Timed out while processing. Please retry.',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .eq('id', job.id);
        await admin
            .from('status_cert_reviews')
            .update({ status: 'FAILED', updated_at: new Date().toISOString() })
            .eq('id', job.review_id)
            .eq('firm_id', job.firm_id);
    }
    console.warn('[statuscert-worker] marked stale RUNNING jobs as FAILED', staleJobs.length);
}
async function retryOrFail(job, message) {
    const admin = (0, admin_1.createServiceSupabaseClient)();
    const transient = /timeout|network|connection|rate limit|temporarily/i.test(message);
    if (transient && job.attempt_count < 2) {
        console.warn('[statuscert-worker] transient error, requeueing', {
            jobId: job.id,
            reviewId: job.review_id,
            attempt: job.attempt_count,
            message
        });
        await admin
            .from('status_cert_jobs')
            .update({
            status: 'QUEUED',
            stage: 'VALIDATING',
            progress: 0,
            error_message: message,
            updated_at: new Date().toISOString()
        })
            .eq('id', job.id);
        return;
    }
    console.error('[statuscert-worker] job failed', {
        jobId: job.id,
        reviewId: job.review_id,
        stage: job.stage,
        message
    });
    await admin
        .from('status_cert_jobs')
        .update({
        status: 'FAILED',
        error_message: message,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    })
        .eq('id', job.id);
    await admin
        .from('status_cert_reviews')
        .update({ status: 'FAILED', updated_at: new Date().toISOString() })
        .eq('id', job.review_id)
        .eq('firm_id', job.firm_id);
}
async function processJob(job) {
    console.log('[statuscert-worker] claimed', {
        jobId: job.id,
        reviewId: job.review_id,
        jobType: job.job_type,
        stage: job.stage,
        attempt: job.attempt_count
    });
    if (job.job_type === 'GENERATE_DRAFT') {
        await (0, pipeline_1.runGenerateDraftJob)(job);
        console.log('[statuscert-worker] completed', { jobId: job.id, reviewId: job.review_id, jobType: job.job_type });
        return;
    }
    if (job.job_type === 'EXPORT_DOCX') {
        await (0, pipeline_1.runExportDocxJob)(job);
        console.log('[statuscert-worker] completed', { jobId: job.id, reviewId: job.review_id, jobType: job.job_type });
        return;
    }
    await retryOrFail(job, `Unsupported job type: ${job.job_type}`);
}
async function main() {
    let idleTicks = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            await markStaleRunningJobs();
            const claimed = [];
            for (let i = 0; i < WORKER_CONCURRENCY; i += 1) {
                const job = await claimNextJob();
                if (!job)
                    break;
                claimed.push(job);
            }
            if (!claimed.length) {
                idleTicks += 1;
                if (idleTicks % IDLE_LOG_EVERY === 0) {
                    console.log('[statuscert-worker] idle');
                }
                await new Promise((r) => setTimeout(r, POLL_MS));
                continue;
            }
            idleTicks = 0;
            await Promise.all(claimed.map(async (job) => {
                console.log('[statuscert-worker] processing', job.id, job.job_type, 'attempt', job.attempt_count);
                const started = Date.now();
                try {
                    await processJob(job);
                    console.log('[statuscert-worker] latency_ms', {
                        jobId: job.id,
                        reviewId: job.review_id,
                        jobType: job.job_type,
                        latencyMs: Date.now() - started
                    });
                }
                catch (err) {
                    await retryOrFail(job, err?.message || 'Unknown processing error');
                }
            }));
        }
        catch (err) {
            console.error('[statuscert-worker] loop error', err?.message || err);
            await new Promise((r) => setTimeout(r, POLL_MS));
        }
    }
}
main();
