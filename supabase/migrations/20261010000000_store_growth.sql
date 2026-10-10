-- Apply after supabase-setup.sql. Safe to rerun; never drops store data.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.orders
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
create index if not exists zyha_orders_customer_user_idx
  on public.orders(customer_user_id, created_at desc)
  where customer_user_id is not null;
create or replace function public.zyha_attach_customer_order(p_request_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.orders
  set customer_user_id = p_user_id
  where request_id = p_request_id
    and (customer_user_id is null or customer_user_id = p_user_id);
  return found;
end $$;
revoke all on function public.zyha_attach_customer_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.zyha_attach_customer_order(uuid, uuid) to service_role;
drop policy if exists zyha_customer_order_history on public.orders;
create policy zyha_customer_order_history on public.orders
  for select to authenticated
  using (customer_user_id = (select auth.uid()));

create table if not exists public.wishlist_items (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.wishlist_items enable row level security;
drop policy if exists zyha_wishlist_read_own on public.wishlist_items;
create policy zyha_wishlist_read_own on public.wishlist_items
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists zyha_wishlist_add_own on public.wishlist_items;
create policy zyha_wishlist_add_own on public.wishlist_items
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists zyha_wishlist_remove_own on public.wishlist_items;
create policy zyha_wishlist_remove_own on public.wishlist_items
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.wishlist_items from public, anon, authenticated;
grant select, insert, delete on public.wishlist_items to authenticated;
grant all on public.wishlist_items to service_role;

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 120),
  title text not null check (length(btrim(title)) between 3 and 180),
  excerpt text not null default '' check (length(excerpt) <= 500),
  body text not null check (length(btrim(body)) between 1 and 30000),
  cover_image_url text not null default '' check (cover_image_url = '' or (cover_image_url ~ '^https://' and length(cover_image_url) <= 2048)),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists zyha_articles_published_idx
  on public.articles(published_at desc, id) where status = 'published';
alter table public.articles enable row level security;
drop policy if exists zyha_articles_public_read on public.articles;
create policy zyha_articles_public_read on public.articles
  for select to anon, authenticated using (status = 'published');
drop policy if exists zyha_articles_admin_all on public.articles;
create policy zyha_articles_admin_all on public.articles
  for all to authenticated
  using ((select public.zyha_is_admin()))
  with check ((select public.zyha_is_admin()));
revoke all on public.articles from public, anon, authenticated;
grant select on public.articles to anon, authenticated;
grant insert, update, delete on public.articles to authenticated;
grant all on public.articles to service_role;
drop trigger if exists zyha_touch_articles on public.articles;
create trigger zyha_touch_articles before update on public.articles
  for each row execute function public.zyha_touch();

create table if not exists public.footer_info (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 2 and 100),
  content text not null default '' check (length(content) <= 1000),
  href text not null default '' check (
    length(href) <= 2048 and
    (href = '' or href ~ '^https://' or (href ~ '^/' and href !~ '^//'))
  ),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (content <> '' or href <> '')
);
alter table public.footer_info enable row level security;
drop policy if exists zyha_footer_public_read on public.footer_info;
create policy zyha_footer_public_read on public.footer_info
  for select to anon, authenticated using (is_active);
drop policy if exists zyha_footer_admin_all on public.footer_info;
create policy zyha_footer_admin_all on public.footer_info
  for all to authenticated
  using ((select public.zyha_is_admin()))
  with check ((select public.zyha_is_admin()));
revoke all on public.footer_info from public, anon, authenticated;
grant select on public.footer_info to anon, authenticated;
grant insert, update, delete on public.footer_info to authenticated;
grant all on public.footer_info to service_role;
drop trigger if exists zyha_touch_footer_info on public.footer_info;
create trigger zyha_touch_footer_info before update on public.footer_info
  for each row execute function public.zyha_touch();

alter table public.orders
  add column if not exists coupon_code text,
  add column if not exists discount_amount bigint not null default 0;
alter table public.orders drop constraint if exists orders_total_price_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'zyha_orders_total_range') then
    alter table public.orders add constraint zyha_orders_total_range
      check (total_price between 1 and 1000000000);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'zyha_orders_discount_range') then
    alter table public.orders add constraint zyha_orders_discount_range
      check (discount_amount >= 0 and discount_amount < subtotal);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'zyha_orders_discount_total') then
    alter table public.orders add constraint zyha_orders_discount_total
      check (total_price = subtotal + shipping_fee - discount_amount);
  end if;
end $$;
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,40}$'),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value integer not null check (
    (discount_type = 'percent' and discount_value between 1 and 99) or
    (discount_type = 'fixed' and discount_value between 1 and 1000000000)
  ),
  min_subtotal bigint not null default 0 check (min_subtotal between 0 and 1000000000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  max_uses integer check (max_uses is null or max_uses between 1 and 1000000),
  max_uses_per_customer integer check (max_uses_per_customer is null or max_uses_per_customer between 1 and 1000000),
  times_used integer not null default 0 check (times_used >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_key text not null check (customer_key ~ '^[0-9a-f]{64}$'),
  redeemed_at timestamptz not null default now()
);
create index if not exists zyha_coupon_redemptions_customer_idx
  on public.coupon_redemptions(coupon_id, customer_key);
alter table public.coupons enable row level security;
drop policy if exists zyha_coupons_admin_all on public.coupons;
create policy zyha_coupons_admin_all on public.coupons
  for all to authenticated
  using ((select public.zyha_is_admin()))
  with check ((select public.zyha_is_admin()));
revoke all on public.coupons from public, anon, authenticated;
grant select, insert, update, delete on public.coupons to authenticated;
grant all on public.coupons to service_role;
drop trigger if exists zyha_touch_coupons on public.coupons;
create trigger zyha_touch_coupons before update on public.coupons
  for each row execute function public.zyha_touch();
alter table public.coupon_redemptions enable row level security;
drop policy if exists zyha_coupon_redemptions_admin_read on public.coupon_redemptions;
create policy zyha_coupon_redemptions_admin_read on public.coupon_redemptions
  for select to authenticated using ((select public.zyha_is_admin()));
revoke all on public.coupon_redemptions from public, anon, authenticated;
grant select on public.coupon_redemptions to authenticated;
grant all on public.coupon_redemptions to service_role;

create or replace function public.zyha_place_order_with_coupon(
  p_request_id uuid, p_receipt_token text, p_request_hash text, p_items jsonb,
  p_customer jsonb, p_method_id uuid, p_coupon_code text, p_customer_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  oid uuid;
  o public.orders;
  c public.coupons;
  used_by_customer integer;
  discount bigint;
begin
  oid := public.zyha_place_order(
    p_request_id, p_receipt_token, p_request_hash, p_items, p_customer, p_method_id
  );
  select * into o from public.orders where id = oid for update;
  if exists (select 1 from public.coupon_redemptions where order_id = oid) then
    return oid;
  end if;
  if p_coupon_code is null or btrim(p_coupon_code) = '' then
    return oid;
  end if;
  if p_customer_key is null or p_customer_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Identitas pelanggan kupon tidak valid';
  end if;
  select * into c from public.coupons
    where code = upper(btrim(p_coupon_code)) and is_active
    for update;
  if not found or c.starts_at > now() or (c.ends_at is not null and c.ends_at <= now()) then
    raise exception 'Kupon tidak tersedia atau belum/sudah di luar masa berlaku';
  end if;
  if o.subtotal < c.min_subtotal then
    raise exception 'Minimum belanja untuk kupon belum tercapai';
  end if;
  if c.max_uses is not null and c.times_used >= c.max_uses then
    raise exception 'Kupon sudah mencapai batas pemakaian';
  end if;
  if c.max_uses_per_customer is not null then
    select count(*) into used_by_customer from public.coupon_redemptions
      where coupon_id = c.id and customer_key = p_customer_key;
    if used_by_customer >= c.max_uses_per_customer then
      raise exception 'Batas pemakaian kupon untuk pelanggan ini sudah tercapai';
    end if;
  end if;
  discount := case when c.discount_type = 'percent'
    then floor(o.subtotal * c.discount_value / 100.0)::bigint
    else c.discount_value::bigint end;
  discount := least(discount, o.subtotal - 1);
  if discount < 1 then
    raise exception 'Diskon kupon kurang dari Rp1 untuk subtotal ini';
  end if;
  update public.orders
    set coupon_code = c.code, discount_amount = discount,
        total_price = subtotal + shipping_fee - discount
    where id = oid;
  insert into public.coupon_redemptions(coupon_id, order_id, customer_key)
    values (c.id, oid, p_customer_key);
  update public.coupons set times_used = times_used + 1 where id = c.id;
  return oid;
end $$;
revoke all on function public.zyha_place_order_with_coupon(uuid, uuid, text, jsonb, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.zyha_place_order_with_coupon(uuid, uuid, text, jsonb, jsonb, uuid, text, text) to service_role;

create or replace function public.zyha_receipt(p_request_id uuid, p_receipt_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.orders;
begin
  if p_receipt_token is null or p_receipt_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Pesanan tidak ditemukan';
  end if;
  select * into r from public.orders
    where request_id = p_request_id
      and receipt_hash = encode(extensions.digest(p_receipt_token, 'sha256'), 'hex')
      and created_at > now() - interval '30 days';
  if not found then
    raise exception 'Pesanan tidak ditemukan atau akses bukti kedaluwarsa';
  end if;
  return jsonb_build_object(
    'id', r.id, 'order_number', r.order_number, 'items', r.items,
    'subtotal', r.subtotal, 'shipping_fee', r.shipping_fee,
    'coupon_code', r.coupon_code, 'discount_amount', r.discount_amount,
    'total_price', r.total_price, 'status', r.status,
    'payment_method', r.payment_method, 'payment_snapshot', r.payment_snapshot,
    'fulfillment_status', r.fulfillment_status, 'tracking_number', r.tracking_number,
    'carrier', r.carrier, 'created_at', r.created_at
  );
end $$;
revoke all on function public.zyha_receipt(uuid, text) from public, anon, authenticated;
grant execute on function public.zyha_receipt(uuid, text) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'articles') then
      alter publication supabase_realtime add table public.articles;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'footer_info') then
      alter publication supabase_realtime add table public.footer_info;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wishlist_items') then
      alter publication supabase_realtime add table public.wishlist_items;
    end if;
  end if;
end $$;

commit;
