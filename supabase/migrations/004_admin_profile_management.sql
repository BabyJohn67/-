begin;

create or replace function public.admin_update_profile(
  target_profile_id uuid,
  next_role text default null,
  next_is_active boolean default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  updated_profile public.profiles%rowtype;
  active_admin_count integer;
  removes_admin_access boolean;
begin
  select *
  into actor_profile
  from public.profiles
  where id = (select auth.uid());

  if actor_profile.id is null
    or actor_profile.role <> 'admin'
    or actor_profile.is_active is not true then
    raise exception 'Недостаточно прав для управления пользователями.';
  end if;

  if next_role is not null and next_role not in ('guest', 'master', 'admin') then
    raise exception 'Неизвестная роль пользователя.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_profile_id
  for update;

  if target_profile.id is null then
    raise exception 'Пользователь не найден.';
  end if;

  removes_admin_access := target_profile.role = 'admin'
    and target_profile.is_active is true
    and (
      (next_role is not null and next_role <> 'admin')
      or next_is_active is false
    );

  if target_profile.id = actor_profile.id and removes_admin_access then
    raise exception 'Нельзя отключить или понизить собственный аккаунт администратора.';
  end if;

  if removes_admin_access then
    select count(*)
    into active_admin_count
    from public.profiles
    where role = 'admin' and is_active is true;

    if active_admin_count <= 1 then
      raise exception 'В системе должен остаться хотя бы один активный администратор.';
    end if;
  end if;

  update public.profiles
  set
    role = coalesce(next_role, role),
    is_active = coalesce(next_is_active, is_active)
  where id = target_profile_id
  returning * into updated_profile;

  return updated_profile;
end;
$$;

revoke all on function public.admin_update_profile(uuid, text, boolean) from public, anon;
grant execute on function public.admin_update_profile(uuid, text, boolean) to authenticated;

commit;
