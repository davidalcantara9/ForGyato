-- Use este SQL depois de criar o usuario admin em Authentication > Users
-- ou depois de criar a conta admin pelo formulario do site.
-- Email padrao do admin: admin@forgyato.com

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
  name = 'Administrador',
  role = 'admin',
  blocked = false,
  expires_at = now() + interval '3650 days';
