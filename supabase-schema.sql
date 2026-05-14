-- ForGyato usa email + senha em tabela propria, sem Supabase Auth
-- e sem verificacao/confirmacao por email.
--
-- Aviso: como este projeto roda direto no frontend, estas politicas deixam a
-- tabela acessivel pela anon key. E simples e rapido, mas nao substitui um
-- backend seguro para producao.

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  initial_weight numeric(5, 1) not null,
  height numeric(3, 2) not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '365 days'),
  blocked boolean not null default false,
  role text not null default 'user' check (role in ('user', 'admin'))
);

create index if not exists app_users_email_idx on public.app_users (email);
create index if not exists app_users_role_idx on public.app_users (role);

alter table public.app_users enable row level security;

drop policy if exists "app_users_public_select" on public.app_users;
create policy "app_users_public_select"
on public.app_users
for select
to anon
using (true);

drop policy if exists "app_users_public_insert" on public.app_users;
create policy "app_users_public_insert"
on public.app_users
for insert
to anon
with check (true);

drop policy if exists "app_users_public_update" on public.app_users;
create policy "app_users_public_update"
on public.app_users
for update
to anon
using (true)
with check (true);

drop policy if exists "app_users_public_delete" on public.app_users;
create policy "app_users_public_delete"
on public.app_users
for delete
to anon
using (true);

-- Admin padrao:
-- email: davidalcantara9@hotmail.com
-- senha: admin123
--
-- O hash abaixo corresponde a SHA-256 de "forgyato:admin123",
-- mesmo algoritmo usado no index.html.
insert into public.app_users (
  name,
  email,
  password_hash,
  initial_weight,
  height,
  expires_at,
  blocked,
  role
)
values (
  'Administrador',
  'davidalcantara9@hotmail.com',
  '53b318e554b303dae4603c6de8fc2be4a639fe97572e5d21d3af39cfd429378c',
  80,
  1.75,
  now() + interval '3650 days',
  false,
  'admin'
)
on conflict (email) do update set
  name = excluded.name,
  password_hash = excluded.password_hash,
  role = 'admin',
  blocked = false,
  expires_at = now() + interval '3650 days';
