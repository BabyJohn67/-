begin;

create table if not exists public.guest_orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  table_number text not null,
  guest_name text not null,
  guest_phone text not null default '',
  guest_email text not null,
  format_id text not null,
  format_name text not null,
  variant_id text not null,
  variant_name text not null,
  price_at_creation numeric(12, 2) not null default 0,
  strength text not null default '',
  comment text not null default '',
  items jsonb not null default '[]'::jsonb,
  status text not null default 'new',
  assigned_master_id uuid references public.profiles(id) on delete set null,
  hookah_number integer,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text not null default '',
  telegram_sent boolean not null default false,
  email_sent boolean not null default false,
  telegram_error text not null default '',
  email_error text not null default '',
  notification_attempts integer not null default 0,
  request_id text not null unique,
  constraint guest_orders_status_check check (status in ('new', 'accepted', 'preparing', 'ready', 'completed', 'cancelled')),
  constraint guest_orders_hookah_number_check check (hookah_number is null or hookah_number between 1 and 10),
  constraint guest_orders_table_length_check check (char_length(table_number) between 1 and 20),
  constraint guest_orders_name_length_check check (char_length(guest_name) between 2 and 100),
  constraint guest_orders_phone_length_check check (char_length(guest_phone) <= 40),
  constraint guest_orders_email_length_check check (char_length(guest_email) between 3 and 254),
  constraint guest_orders_comment_length_check check (char_length(comment) <= 1000),
  constraint guest_orders_items_array_check check (jsonb_typeof(items) = 'array')
);

create index if not exists guest_orders_user_created_idx
  on public.guest_orders (user_id, created_at desc);
create index if not exists guest_orders_status_created_idx
  on public.guest_orders (status, created_at asc);

alter table public.guest_orders enable row level security;

drop policy if exists "guest_orders_insert_own" on public.guest_orders;
create policy "guest_orders_insert_own"
  on public.guest_orders
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "guest_orders_select_own_or_staff" on public.guest_orders;
create policy "guest_orders_select_own_or_staff"
  on public.guest_orders
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (select private.current_user_role()) in ('master', 'admin')
  );

drop policy if exists "guest_orders_update_staff" on public.guest_orders;
create policy "guest_orders_update_staff"
  on public.guest_orders
  for update
  to authenticated
  using ((select private.current_user_role()) in ('master', 'admin'))
  with check ((select private.current_user_role()) in ('master', 'admin'));

revoke all on public.guest_orders from anon, authenticated;
grant select, insert on public.guest_orders to authenticated;
grant update on public.guest_orders to authenticated;
grant all on public.guest_orders to service_role;

commit;
