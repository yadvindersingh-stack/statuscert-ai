 -- Enable extensions
create extension if not exists "pgcrypto";

-- Types
create type firm_role as enum ('OWNER', 'ADMIN', 'MEMBER');

-- Tables
create table if not exists firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists firm_members (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  user_id uuid not null,
  role firm_role not null default 'MEMBER',
  created_at timestamptz not null default now(),
  unique (firm_id, user_id)
);

create table if not exists firm_billing (
  firm_id uuid primary key references firms(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_type text,
  status text,
  trial_remaining integer not null default 1,
  credits_balance integer not null default 0,
  founder_override boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists status_cert_templates (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references firms(id) on delete cascade,
  title text not null,
  template_json jsonb not null,
  is_default boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists status_cert_reviews (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  created_by uuid not null,
  title text not null,
  status text not null default 'DRAFT',
  document_path text,
  extracted_json jsonb,
  review_sections_json jsonb,
  review_html text,
  review_text text,
  flags_json jsonb,
  prompt_version text,
  model text,
  template_id uuid references status_cert_templates(id),
  exported_doc_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists status_cert_review_documents (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  review_id uuid not null references status_cert_reviews(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  size_bytes bigint,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists status_cert_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  review_id uuid references status_cert_reviews(id) on delete cascade,
  actor_id uuid,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Helper functions
create or replace function public.is_firm_member(check_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from firm_members fm
    where fm.firm_id = check_firm and fm.user_id = auth.uid()
  );
$$;

create or replace function public.is_firm_owner(check_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from firm_members fm
    where fm.firm_id = check_firm and fm.user_id = auth.uid() and fm.role = 'OWNER'
  );
$$;

create or replace function public.increment_credits(firm_id uuid, amount integer)
returns void language plpgsql security definer as $$
begin
  update firm_billing
  set credits_balance = credits_balance + amount,
      updated_at = now()
  where firm_billing.firm_id = increment_credits.firm_id;
end;
$$;

-- Trigger to bootstrap firm member + billing
create or replace function public.bootstrap_firm()
returns trigger language plpgsql security definer as $$
begin
  insert into firm_members (firm_id, user_id, role)
  values (new.id, new.created_by, 'OWNER');

  insert into firm_billing (firm_id)
  values (new.id)
  on conflict (firm_id) do nothing;

  return new;
end;
$$;

create trigger on_firm_created
after insert on firms
for each row execute function public.bootstrap_firm();

-- RLS
alter table firms enable row level security;
alter table firm_members enable row level security;
alter table firm_billing enable row level security;
alter table status_cert_templates enable row level security;
alter table status_cert_reviews enable row level security;
alter table status_cert_review_documents enable row level security;
alter table status_cert_events enable row level security;

-- Policies: firms
create policy "firm select" on firms
  for select using (is_firm_member(id));

create policy "firm insert" on firms
  for insert with check (auth.uid() = created_by);

create policy "firm update" on firms
  for update using (is_firm_owner(id));

-- Policies: firm_members
create policy "members select" on firm_members
  for select using (is_firm_member(firm_id));

create policy "members insert" on firm_members
  for insert with check (is_firm_owner(firm_id));

create policy "members update" on firm_members
  for update using (is_firm_owner(firm_id));

create policy "members delete" on firm_members
  for delete using (is_firm_owner(firm_id));

-- Policies: firm_billing
create policy "billing select" on firm_billing
  for select using (is_firm_member(firm_id));

create policy "billing update" on firm_billing
  for update using (is_firm_owner(firm_id));

-- Policies: templates
create policy "templates select" on status_cert_templates
  for select using (firm_id is null or is_firm_member(firm_id));

create policy "templates insert" on status_cert_templates
  for insert with check (firm_id is not null and is_firm_member(firm_id));

create policy "templates update" on status_cert_templates
  for update using (firm_id is not null and is_firm_owner(firm_id));

create policy "templates delete" on status_cert_templates
  for delete using (firm_id is not null and is_firm_owner(firm_id));

-- Policies: reviews
create policy "reviews select" on status_cert_reviews
  for select using (is_firm_member(firm_id));

create policy "reviews insert" on status_cert_reviews
  for insert with check (is_firm_member(firm_id));

create policy "reviews update" on status_cert_reviews
  for update using (is_firm_member(firm_id));

-- Policies: review documents
create policy "review docs select" on status_cert_review_documents
  for select using (is_firm_member(firm_id));

create policy "review docs insert" on status_cert_review_documents
  for insert with check (is_firm_member(firm_id));

create policy "review docs delete" on status_cert_review_documents
  for delete using (is_firm_member(firm_id));

-- Policies: events
create policy "events select" on status_cert_events
  for select using (is_firm_member(firm_id));

create policy "events insert" on status_cert_events
  for insert with check (is_firm_member(firm_id));

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Storage policies
create policy "documents read" on storage.objects
  for select using (bucket_id = 'documents' and is_firm_member((metadata->>'firm_id')::uuid));

create policy "documents insert" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and is_firm_member((metadata->>'firm_id')::uuid)
  );

create policy "documents update" on storage.objects
  for update using (
    bucket_id = 'documents'
    and is_firm_member((metadata->>'firm_id')::uuid)
  );

-- Seed global default template
insert into status_cert_templates (firm_id, title, template_json, is_default, created_by)
select
  null,
  'Status Certificate Review – Precedent',
  '{
    "title": "Status Certificate Review",
    "mode": "precedent_locked",
    "disclaimers": [
      "Facts are drawn from the provided status certificate package and should be verified against the source documents.",
      "This review does not replace independent legal analysis or partner review."
    ],
    "sections": [
      { "key":"intro", "title":"Purpose and Scope", "instructions":"Explain purpose, source package scope, and key assumptions. Include inline citations for factual statements.", "style":"narrative" },
      { "key":"summary", "title":"Key Terms Summary", "instructions":"Produce concise terms summary (unit, parking, locker, common expenses, arrears, reserve, legal proceedings) and avoid repeating details covered in budget/insurance sections.", "style":"structured" },
      { "key":"insurance", "title":"Insurance", "instructions":"State whether Corporation has/has not secured all policies required under the Condominium Act, 1998, with citation and key policy term notes.", "style":"narrative" },
      { "key":"budget_reserve", "title":"Budget and Reserve Fund", "instructions":"Discuss common expenses, fee increases, reserve balance/study timing with evidence. Do not conclude reserve fund is healthy unless rationale is explicit.", "style":"narrative" },
      { "key":"pets", "title":"Pet Rules", "instructions":"Note any pet restrictions or approvals required.", "style":"narrative" },
      { "key":"leasing", "title":"Leasing Rules", "instructions":"Summarize leasing restrictions, short-term rental prohibition status, and any notice/approval requirements.", "style":"narrative" },
      { "key":"additional", "title":"Additional Items to Note", "instructions":"Capture sub-metering, unusual clauses, litigation, special assessments, and operational follow-ups.", "style":"narrative" }
    ]
  }'::jsonb,
  true,
  '00000000-0000-0000-0000-000000000000'
where not exists (
  select 1 from status_cert_templates where firm_id is null and is_default = true
);
