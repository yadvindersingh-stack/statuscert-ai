do $$
begin
  begin
    alter publication supabase_realtime add table public.status_cert_jobs;
  exception
    when duplicate_object then
      null;
  end;
end $$;

