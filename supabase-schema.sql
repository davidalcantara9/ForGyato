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
  role text not null default 'user' check (role in ('user', 'admin')),
  goal text not null default 'perder' check (goal in ('ganhar', 'perder')),
  goal_days integer not null default 30,
  strategy text not null default 'moderado' check (strategy in ('tranquilo', 'moderado', 'pesado')),
  ai_credits integer not null default 50,
  plan_text text
);

alter table public.app_users add column if not exists goal text not null default 'perder';
alter table public.app_users add column if not exists goal_days integer not null default 30;
alter table public.app_users add column if not exists strategy text not null default 'moderado';
alter table public.app_users add column if not exists ai_credits integer not null default 50;
alter table public.app_users add column if not exists plan_text text;

create index if not exists app_users_email_idx on public.app_users (email);
create index if not exists app_users_role_idx on public.app_users (role);

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_users enable row level security;
alter table public.app_settings enable row level security;

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

drop policy if exists "app_settings_public_select" on public.app_settings;
create policy "app_settings_public_select"
on public.app_settings
for select
to anon
using (true);

drop policy if exists "app_settings_public_insert" on public.app_settings;
create policy "app_settings_public_insert"
on public.app_settings
for insert
to anon
with check (true);

drop policy if exists "app_settings_public_update" on public.app_settings;
create policy "app_settings_public_update"
on public.app_settings
for update
to anon
using (true)
with check (true);

insert into public.app_users (
  name,
  email,
  password_hash,
  initial_weight,
  height,
  expires_at,
  blocked,
  role,
  goal,
  goal_days,
  strategy,
  ai_credits,
  plan_text
)
values (
  'Administrador',
  'davidalcantara9@hotmail.com',
  '53b318e554b303dae4603c6de8fc2be4a639fe97572e5d21d3af39cfd429378c',
  80,
  1.75,
  now() + interval '3650 days',
  false,
  'admin',
  'perder',
  30,
  'moderado',
  50,
  'Administrador do ForGyato.'
)
on conflict (email) do update set
  name = excluded.name,
  password_hash = excluded.password_hash,
  role = 'admin',
  blocked = false,
  expires_at = now() + interval '3650 days',
  ai_credits = greatest(public.app_users.ai_credits, 50);
