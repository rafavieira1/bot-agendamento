do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='mensagens'
  ) then
    alter publication supabase_realtime add table mensagens;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='conversas'
  ) then
    alter publication supabase_realtime add table conversas;
  end if;
end $$;
