begin;

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  name text not null default '',
  phone text not null default '',
  role text not null default 'guest',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('guest', 'master', 'admin')),
  constraint profiles_name_length_check check (char_length(name) <= 100),
  constraint profiles_phone_length_check check (char_length(phone) <= 40)
);

alter table public.profiles enable row level security;

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and is_active = true
  limit 1;
$$;

revoke all on function private.current_user_role() from public;
grant execute on function private.current_user_role() to authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, phone, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'name', ''), 100),
    left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 40),
    'guest',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = coalesce(new.email, ''), updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute procedure public.handle_user_email_update();

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_profile_updated_at();

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  to authenticated
  using (
    (select auth.uid()) = id
    or (select private.current_user_role()) = 'admin'
  );

drop policy if exists "profiles_update_own_contact_fields" on public.profiles;
create policy "profiles_update_own_contact_fields"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id and is_active = true)
  with check ((select auth.uid()) = id and is_active = true);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name, phone) on public.profiles to authenticated;
grant all on public.profiles to service_role;

commit;
