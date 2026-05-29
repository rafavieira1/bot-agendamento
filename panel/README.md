# Painel Atendimento Humano — Safe Work

Painel Vite+React+TS+Tailwind para responsáveis humanos continuarem conversas WhatsApp transferidas pelo bot.

## Setup local

```bash
cd panel
npm install
cp .env.example .env
# preencher VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_PAINEL_WEBHOOK_URL
npm run dev
```

Acesse http://localhost:5173 → login com user Supabase Auth vinculado a `responsaveis`.

## Estrutura

- `src/lib/supabase.ts` — client Supabase + tipos
- `src/lib/api.ts` — `sendMessage` (POST → WF6 n8n), `encerrarConversa` (UPDATE Supabase)
- `src/hooks/useAuth.ts` — sessão + dados do responsável vinculado
- `src/hooks/useConversas.ts` — lista conversas + realtime de mensagens
- `src/pages/Login.tsx` — form email/senha
- `src/pages/ConversasList.tsx` — lista (abertas + encerradas)
- `src/pages/ConversaDetail.tsx` — histórico + input + botão encerrar
- `src/components/MessageBubble.tsx` — bubble por papel (user/assistant/humano/tool/system)
- `src/components/SendMessageInput.tsx` — textarea + envio

## Segurança

- **RLS Supabase** filtra conversas/mensagens por `responsavel_id = auth.uid()`
- Anon key é segura (publicada) — RLS protege
- POST pra WF6 manda JWT no body; n8n valida via `auth.getUser(jwt)`
- Path do webhook contém `PAINEL_SECRET` (defesa em profundidade)

## Testes

```bash
npm test
```

## Deploy Netlify

`netlify.toml` já configurado (base=panel, publish=panel/dist). Env vars no painel Netlify:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAINEL_WEBHOOK_URL`.

## Pendências

- Endpoint WF6 (`/webhook/painel-send-<PAINEL_SECRET>`) ainda não criado no n8n — envios pelo painel falham até subir
- Seed responsáveis: criar users no Supabase Auth + INSERT em `responsaveis`
- Vincular agendas: `update agendas_config set responsavel_id = ...`
