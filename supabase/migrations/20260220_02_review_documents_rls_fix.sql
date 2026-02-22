create table if not exists public.status_cert_review_documents (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  review_id uuid not null references public.status_cert_reviews(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  size_bytes bigint,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

alter table public.status_cert_review_documents enable row level security;

drop policy if exists "review docs select" on public.status_cert_review_documents;
create policy "review docs select" on public.status_cert_review_documents
  for select using (public.is_firm_member(firm_id));

drop policy if exists "review docs insert" on public.status_cert_review_documents;
create policy "review docs insert" on public.status_cert_review_documents
  for insert with check (public.is_firm_member(firm_id));

drop policy if exists "review docs delete" on public.status_cert_review_documents;
create policy "review docs delete" on public.status_cert_review_documents
  for delete using (public.is_firm_member(firm_id));
