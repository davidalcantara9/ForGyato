-- Admin ForGyato sem Supabase Auth.
-- Rode este arquivo apenas se quiser recriar/promover o admin.
--
-- Email: davidalcantara9@hotmail.com
-- Senha: admin123

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
