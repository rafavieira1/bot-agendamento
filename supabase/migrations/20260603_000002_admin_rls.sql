-- Admin enxerga todos os responsaveis (gestão de usuários pelo painel).
-- is_admin() é SECURITY DEFINER pra evitar recursão de RLS (policy em
-- responsaveis consultando responsaveis).

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.responsaveis
    where auth_user_id = uid and role = 'admin' and ativo
  );
$$;

create policy resp_admin_select on public.responsaveis
  for select to authenticated
  using (public.is_admin(auth.uid()));
