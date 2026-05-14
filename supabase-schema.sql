create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  initial_weight numeric(5, 1) not null,
  height numeric(3, 2) not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '365 days'),
  blocked boolean not null default false,
  role text not null default 'user' check (role in ('user', 'admin'))
);

alter table public.profiles enable row level security;

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    name,
    email,
    initial_weight,
    height,
    expires_at,
    blocked,
    role
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'initial_weight')::numeric, 80),
    coalesce((new.raw_user_meta_data->>'height')::numeric, 1.75),
    case
      when new.email = 'admin@forgyato.com' then now() + interval '3650 days'
      else now() + interval '365 days'
    end,
    false,
    case
      when new.email = 'admin@forgyato.com' then 'admin'
      else 'user'
    end
  )
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email,
    role = case
      when excluded.email = 'admin@forgyato.com' then 'admin'
      else public.profiles.role
    end,
    blocked = false,
    expires_at = case
      when excluded.email = 'admin@forgyato.com' then now() + interval '3650 days'
      else public.profiles.expires_at
    end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or public.is_admin(auth.uid())
);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
on public.profiles
for delete
to authenticated
using (public.is_admin(auth.uid()));

-- Depois de criar o usuario admin no painel Authentication > Users,
-- rode este bloco trocando o email se quiser outro admin.
insert into public.profiles (
  id,
  name,
  email,
  initial_weight,
  height,
  expires_at,
  blocked,
  role
)
select
  id,
  'Administrador',
  email,
  80,
  1.75,
  now() + interval '3650 days',
  false,
  'admin'
from auth.users
where email = 'admin@forgyato.com'
on conflict (id) do update set
  role = 'admin',
  blocked = false,
  expires_at = now() + interval '3650 days';
