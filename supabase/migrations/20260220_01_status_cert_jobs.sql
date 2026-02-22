create table if not exists public.status_cert_jobs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  review_id uuid not null references public.status_cert_reviews(id) on delete cascade,
  job_type text not null,
  status text not null default 'QUEUED',
  stage text,
  progress integer not null default 0,
  attempt_count integer not null default 0,
  error_code text,
  error_message text,
  payload jsonb,
  result jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (job_type in ('GENERATE_DRAFT', 'EXPORT_DOCX')),
  check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  check (progress >= 0 and progress <= 100)
);

create index if not exists status_cert_jobs_queue_idx
  on public.status_cert_jobs(status, created_at)
  where status in ('QUEUED', 'RUNNING');

create index if not exists status_cert_jobs_review_idx
  on public.status_cert_jobs(review_id, created_at desc);

alter table public.status_cert_jobs enable row level security;

drop policy if exists "jobs select" on public.status_cert_jobs;
create policy "jobs select" on public.status_cert_jobs
  for select using (public.is_firm_member(firm_id));

drop policy if exists "jobs insert" on public.status_cert_jobs;
create policy "jobs insert" on public.status_cert_jobs
  for insert with check (public.is_firm_member(firm_id));

drop policy if exists "jobs update" on public.status_cert_jobs;
create policy "jobs update" on public.status_cert_jobs
  for update using (public.is_firm_member(firm_id));

create or replace function public.claim_next_status_cert_job()
returns public.status_cert_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  job_row public.status_cert_jobs;
begin
  select *
  into job_row
  from public.status_cert_jobs
  where status = 'QUEUED'
  order by created_at asc
  for update skip locked
  limit 1;

  if job_row.id is null then
    return null;
  end if;

  update public.status_cert_jobs
  set status = 'RUNNING',
      stage = coalesce(stage, 'VALIDATING'),
      progress = case when progress < 5 then 5 else progress end,
      attempt_count = attempt_count + 1,
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = job_row.id
  returning * into job_row;

  return job_row;
end;
$$;
