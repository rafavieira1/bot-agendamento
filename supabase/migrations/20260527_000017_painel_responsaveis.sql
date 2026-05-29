create table responsaveis (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  nome text not null,
  email text unique not null,
  whatsapp text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table responsaveis enable row level security;
create index if not exists idx_responsaveis_auth_user_id on responsaveis(auth_user_id);
create index if not exists idx_responsaveis_ativo on responsaveis(ativo) where ativo;
