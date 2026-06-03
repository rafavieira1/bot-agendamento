-- Restringe EXECUTE de is_admin() ao role authenticated.
-- Por padrão funções são executáveis por PUBLIC; como is_admin() é SECURITY DEFINER
-- e revela se um uuid é admin, removemos o acesso de PUBLIC/anon.
-- Supabase também concede anon/service_role explicitamente em funções public --
-- revogamos anon (unauthenticated) mas mantemos service_role (backend confiável).

revoke execute on function public.is_admin(uuid) from public;
revoke execute on function public.is_admin(uuid) from anon;
grant execute on function public.is_admin(uuid) to authenticated;
