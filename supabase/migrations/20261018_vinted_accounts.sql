create table if not exists public.vinted_stock (
  sku_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists vinted_stock_owner_updated_idx
  on public.vinted_stock ((data ->> 'owner_id'), updated_at desc);

alter table public.vinted_stock enable row level security;
grant select, insert, update, delete on public.vinted_stock to service_role;

create table if not exists public.vinted_sku_counters (
  user_id uuid primary key references auth.users (id) on delete cascade,
  next_value bigint not null default 0 check (next_value >= 0)
);

alter table public.vinted_sku_counters enable row level security;
grant select, insert, update, delete on public.vinted_sku_counters to service_role;

create or replace function public.reserve_vinted_sku(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  reserved_value bigint;
begin
  insert into public.vinted_sku_counters (user_id, next_value)
  values (p_user_id, 1)
  on conflict (user_id) do update
    set next_value = public.vinted_sku_counters.next_value + 1
  returning next_value into reserved_value;

  return reserved_value;
end;
$$;

revoke all on function public.reserve_vinted_sku(uuid) from public, anon, authenticated;
grant execute on function public.reserve_vinted_sku(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'purchase-receipts',
  'purchase-receipts',
  false,
  8388608,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;