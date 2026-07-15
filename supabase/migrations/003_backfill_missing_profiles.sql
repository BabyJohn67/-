begin;

insert into public.profiles (id, email, name, phone, role, is_active)
select
  users.id,
  coalesce(users.email, ''),
  left(coalesce(users.raw_user_meta_data ->> 'name', ''), 100),
  left(coalesce(users.raw_user_meta_data ->> 'phone', ''), 40),
  'guest',
  true
from auth.users as users
on conflict (id) do nothing;

commit;
