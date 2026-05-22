-- Migration: 20260520_000009_trigger_retomar
-- Purpose: Fire a pg_net HTTP POST to n8n whenever a notificacoes_pendentes row of
--          tipo='cadastrar_funcionario' transitions from status='aberto' to 'resolvido'.
--          This lets the bot resume the conversation automatically after a Safe team
--          member manually registers the employee in SOC.
--
-- Prerequisites:
--   1. pg_net extension must be enabled:
--        select * from pg_extension where extname = 'pg_net';
--      If not present, enable via Supabase Dashboard → Database → Extensions → pg_net.
--
--   2. Set the webhook URL in Supabase config (do this AFTER the n8n workflow is deployed
--      and its webhook URL is known):
--        alter database postgres set "app.retomar_webhook_url" =
--          'https://your-n8n-host/webhook/retomar-<uuid>';
--
--      Or via SQL in the Supabase SQL editor:
--        alter database postgres
--          set "app.retomar_webhook_url" = 'https://your-n8n-host/webhook/retomar-<uuid>';
--
--      The setting is read at trigger execution time via:
--        current_setting('app.retomar_webhook_url', true)
--      If the setting is NULL (not configured), net.http_post is skipped silently.

create or replace function notificar_retomar_conversa() returns trigger
language plpgsql as $$
declare
  webhook_url text := current_setting('app.retomar_webhook_url', true);
begin
  if NEW.status = 'resolvido' and OLD.status = 'aberto' and NEW.tipo = 'cadastrar_funcionario' then
    perform net.http_post(
      url := webhook_url,
      body := jsonb_build_object('conversa_id', NEW.conversa_id, 'notif_id', NEW.id)::text,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  end if;
  return NEW;
end $$;

create trigger trg_retomar_conversa
  after update on notificacoes_pendentes
  for each row execute function notificar_retomar_conversa();
