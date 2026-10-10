-- ZYHA ID webshop v1.1 — run ONCE in SQL Editor of a NEW, EMPTY Supabase project.
-- Safe to rerun on this exact schema; existing catalog/settings are not overwritten.
-- This is NOT a recovery of data/Auth users/Storage files from the lost project.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';
-- Optional: create this user FIRST in Supabase Authentication > Users, then enter
-- the confirmed email below. Empty means no administrator is automatically created.
select set_config('zyha.bootstrap_admin_email', '', true);

do $$
begin
  if to_regclass('zyha_private.schema_meta') is null and
     (to_regclass('public.products') is not null or to_regclass('public.orders') is not null
      or to_regclass('public.settings') is not null or to_regclass('public.payment_methods') is not null
      or to_regclass('public.admin_users') is not null) then
    raise exception 'ZYHA_SETUP_REQUIRES_EMPTY_PROJECT: existing tables found. No data was changed.';
  end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists zyha_private;
revoke all on schema zyha_private from public, anon, authenticated;
grant usage on schema zyha_private to service_role;
create table if not exists zyha_private.schema_meta (id boolean primary key default true check(id), version integer not null);
insert into zyha_private.schema_meta values(true,1) on conflict(id) do nothing;
do $$ begin
  if (select version from zyha_private.schema_meta where id) <> 1 then raise exception 'Unsupported schema version'; end if;
  if not exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto' and n.nspname='extensions') then raise exception 'pgcrypto must be installed in extensions schema'; end if;
end $$;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create or replace function public.zyha_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.admin_users where user_id=(select auth.uid()) and is_active);
$$;
revoke all on function public.zyha_is_admin() from public, anon;
grant execute on function public.zyha_is_admin() to authenticated, service_role;
alter table public.admin_users enable row level security;
drop policy if exists zyha_own_admin_membership on public.admin_users;
create policy zyha_own_admin_membership on public.admin_users for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
grant all on public.admin_users to service_role;

create table if not exists public.settings (
  id smallint primary key default 1 check(id=1),
  store_name text not null default 'ZYHA ID' check(length(btrim(store_name)) between 1 and 100),
  banner_url text not null default '' check(banner_url='' or banner_url ~ '^https://'),
  hero_title text not null default 'GET READY BAGS.' check(length(hero_title)<=120),
  store_notice text not null default '' check(length(store_notice)<=500),
  categories text[] not null default '{}' check(cardinality(categories)<=50),
  admin_phone text not null default '' check(admin_phone='' or admin_phone ~ '^62[0-9]{8,13}$'),
  shipping_fee bigint not null default 0 check(shipping_fee between 0 and 1000000000),
  free_shipping_min bigint check(free_shipping_min between 0 and 1000000000),
  updated_at timestamptz not null default now()
);
insert into public.settings(id) values(1) on conflict(id) do nothing;
create table if not exists public.shipping_origin (
  id smallint primary key default 1 check(id=1),
  name text not null default '' check(length(name)<=120),
  phone text not null default '' check(phone='' or phone ~ '^62[0-9]{8,13}$'),
  address text not null default '' check(length(address)<=500),
  district text not null default '' check(length(district)<=100),
  city text not null default '' check(length(city)<=100),
  province text not null default '' check(length(province)<=100),
  postal_code text not null default '' check(postal_code='' or postal_code ~ '^[0-9]{5}$'),
  updated_at timestamptz not null default now()
);
insert into public.shipping_origin(id) values(1) on conflict(id) do nothing;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(btrim(title)) between 1 and 200),
  price bigint not null check(price between 1 and 1000000000),
  description text not null default '' check(length(description)<=10000),
  category text not null default '' check(length(category)<=100),
  image_url text not null default '' check(image_url='' or image_url ~ '^https://'),
  images text[] not null default '{}' check(cardinality(images)<=5),
  variants jsonb not null default '[]' check(jsonb_typeof(variants)='array' and jsonb_array_length(variants)<=30),
  stock integer check(stock between 0 and 100000000),
  weight_grams integer not null default 0,
  is_active boolean not null default true,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zyha_products_weight_range check(weight_grams between 0 and 100000000)
);
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(btrim(name)) between 1 and 100),
  account_number text not null default '' check(length(account_number)<=100),
  account_holder text not null default '' check(length(account_holder)<=150),
  type text not null check(type in ('Bank','E-Wallet','QRIS')),
  qris_url text not null default '' check(qris_url='' or qris_url ~ '^https://'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint zyha_payment_details check (
    (type in ('Bank','E-Wallet') and length(btrim(account_number))>0 and length(btrim(account_holder))>0)
    or (type='QRIS' and qris_url<>''))
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  request_id uuid not null unique,
  receipt_hash text not null,
  request_hash text not null,
  customer_name text not null check(length(customer_name) between 2 and 120),
  customer_address text not null check(length(customer_address) between 10 and 1000),
  customer_district text not null default '' check(length(customer_district)<=100),
  customer_city text not null default '' check(length(customer_city)<=100),
  customer_province text not null default '' check(length(customer_province)<=100),
  customer_postal_code text not null default '' check(customer_postal_code='' or customer_postal_code ~ '^[0-9]{5}$'),
  customer_phone text not null check(customer_phone ~ '^62[0-9]{8,13}$'),
  customer_note text not null default '' check(length(customer_note)<=500),
  items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 50),
  subtotal bigint not null check(subtotal>0),
  shipping_fee bigint not null check(shipping_fee>=0),
  total_price bigint not null check(total_price between 1 and 1000000000),
  total_weight_grams bigint not null default 0,
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  payment_method text not null,
  payment_snapshot jsonb not null,
  status text not null default 'pending' check(status in ('pending','paid','cancelled','expired','failed','refunded','partial_refund')),
  fulfillment_status text not null default 'unfulfilled' check(fulfillment_status in ('unfulfilled','processing','shipped','completed')),
  tracking_number text not null default '' check(length(tracking_number)<=120),
  carrier text not null default '' check(length(carrier)<=80),
  stock_restored boolean not null default false,
  refund_amount bigint not null default 0 check(refund_amount>=0 and refund_amount<=total_price),
  version bigint not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint zyha_orders_total_weight_range check(total_weight_grams between 0 and 100000000000)
);
create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event text not null, old_status text, new_status text,
  note text not null default '' check(length(note)<=2000),
  created_at timestamptz not null default now()
);
create table if not exists public.shipping_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider_request_id uuid not null default gen_random_uuid() unique,
  package_number integer not null default 1 check(package_number between 1 and 100),
  provider_code text not null check(length(provider_code) between 1 and 40),
  provider_shipment_id text not null default '' check(length(provider_shipment_id)<=200),
  carrier_code text not null default '' check(length(carrier_code)<=80),
  carrier_name text not null default '' check(length(carrier_name)<=120),
  service_code text not null default '' check(length(service_code)<=100),
  service_name text not null default '' check(length(service_name)<=120),
  tracking_number text not null default '' check(length(tracking_number)<=120),
  status text not null default 'created' check(status in ('created','booked','picked_up','in_transit','delivered','failed','cancelled')),
  label_url text not null default '' check(label_url='' or label_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists zyha_shipping_shipments_order on public.shipping_shipments(order_id,created_at desc);
create table if not exists zyha_private.shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null check(length(provider_code) between 1 and 40),
  origin jsonb not null check(jsonb_typeof(origin)='object'),
  destination jsonb not null check(jsonb_typeof(destination)='object'),
  parcel_weight_grams integer not null check(parcel_weight_grams between 1 and 100000000),
  services jsonb not null check(jsonb_typeof(services)='array' and jsonb_array_length(services) between 1 and 100),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check(expires_at>created_at)
);
create index if not exists zyha_shipping_quotes_expiry on zyha_private.shipping_quotes(expires_at);
alter table public.orders add column if not exists shipping_quote_id uuid
  references zyha_private.shipping_quotes(id) on delete restrict;
alter table zyha_private.shipping_quotes enable row level security;
revoke all on zyha_private.shipping_quotes from public,anon,authenticated;
grant select,insert,update,delete on zyha_private.shipping_quotes to service_role;
alter table public.shipping_shipments enable row level security;
drop policy if exists zyha_shipping_shipments_admin_read on public.shipping_shipments;
create policy zyha_shipping_shipments_admin_read on public.shipping_shipments for select to authenticated using((select public.zyha_is_admin()));
revoke all on public.shipping_shipments from public,anon,authenticated;
grant select on public.shipping_shipments to authenticated;
grant all on public.shipping_shipments to service_role;
alter table public.shipping_origin enable row level security;
drop policy if exists zyha_shipping_origin_admin on public.shipping_origin;
create policy zyha_shipping_origin_admin on public.shipping_origin for all to authenticated
  using((select public.zyha_is_admin())) with check((select public.zyha_is_admin()));
revoke all on public.shipping_origin from public,anon,authenticated;
grant select,update on public.shipping_origin to authenticated;
grant all on public.shipping_origin to service_role;
create table if not exists zyha_private.request_limits (
  key text not null, bucket bigint not null, hits integer not null,
  updated_at timestamptz not null default now(), primary key(key,bucket)
);

create or replace function public.zyha_touch() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=clock_timestamp(); return new; end $$;
create or replace function public.zyha_product_guard() returns trigger language plpgsql set search_path='' as $$
declare v jsonb; img text;
begin
 new.title=btrim(new.title);new.category=btrim(new.category);
 if tg_op='UPDATE' then new.version=old.version+1; new.created_at=old.created_at; else new.version=1; end if;
 new.updated_at=clock_timestamp();
 foreach img in array new.images loop
  if img is null or img !~ '^https://' or length(img)>2048 then raise exception 'URL gambar tidak valid'; end if;
 end loop;
 if jsonb_typeof(new.variants)<>'array' then raise exception 'Variasi harus berupa array'; end if;
 for v in select value from jsonb_array_elements(new.variants) loop
  if jsonb_typeof(v)<>'object' or jsonb_typeof(v->'name') is distinct from 'string' or coalesce(length(btrim(v->>'name')),0) not between 1 and 100
     or (coalesce(v->>'image','')<>'' and (v->>'image' !~ '^https://' or length(v->>'image')>2048)) then raise exception 'Varian tidak valid'; end if;
 end loop;
 new.variants=coalesce((select jsonb_agg(jsonb_build_object('name',btrim(value->>'name'),'image',btrim(coalesce(value->>'image','')))) from jsonb_array_elements(new.variants)), '[]'::jsonb);
 if (select count(*) from jsonb_array_elements(new.variants))<>(select count(distinct btrim(value->>'name')) from jsonb_array_elements(new.variants)) then raise exception 'Nama varian tidak boleh duplikat'; end if;
 return new;
end $$;
drop trigger if exists zyha_product_guard on public.products;
create trigger zyha_product_guard before insert or update on public.products for each row execute function public.zyha_product_guard();
drop trigger if exists zyha_touch_settings on public.settings;
create trigger zyha_touch_settings before update on public.settings for each row execute function public.zyha_touch();
drop trigger if exists zyha_touch_shipping_origin on public.shipping_origin;
create trigger zyha_touch_shipping_origin before update on public.shipping_origin for each row execute function public.zyha_touch();
drop trigger if exists zyha_touch_shipping_shipments on public.shipping_shipments;
create trigger zyha_touch_shipping_shipments before update on public.shipping_shipments for each row execute function public.zyha_touch();
drop trigger if exists zyha_touch_payment_methods on public.payment_methods;
create trigger zyha_touch_payment_methods before update on public.payment_methods for each row execute function public.zyha_touch();

-- A single precise public read policy for each catalog table. Administrative
-- privileges are never taken from editable auth.user_metadata.
alter table public.settings enable row level security;
alter table public.products enable row level security;
alter table public.payment_methods enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
drop policy if exists zyha_settings_read on public.settings;
create policy zyha_settings_read on public.settings for select to anon,authenticated using(id=1);
drop policy if exists zyha_settings_update on public.settings;
create policy zyha_settings_update on public.settings for update to authenticated using((select public.zyha_is_admin())) with check((select public.zyha_is_admin()));
drop policy if exists zyha_products_public on public.products;
create policy zyha_products_public on public.products for select to anon,authenticated using(is_active);
drop policy if exists zyha_products_admin on public.products;
create policy zyha_products_admin on public.products for all to authenticated using((select public.zyha_is_admin())) with check((select public.zyha_is_admin()));
drop policy if exists zyha_methods_public on public.payment_methods;
create policy zyha_methods_public on public.payment_methods for select to anon,authenticated using(is_active);
drop policy if exists zyha_methods_admin on public.payment_methods;
create policy zyha_methods_admin on public.payment_methods for all to authenticated using((select public.zyha_is_admin())) with check((select public.zyha_is_admin()));
drop policy if exists zyha_orders_admin_read on public.orders;
create policy zyha_orders_admin_read on public.orders for select to authenticated using((select public.zyha_is_admin()));
drop policy if exists zyha_events_admin_read on public.order_events;
create policy zyha_events_admin_read on public.order_events for select to authenticated using((select public.zyha_is_admin()));
revoke all on public.settings,public.products,public.payment_methods,public.orders,public.order_events from public,anon,authenticated;
grant select on public.settings,public.products,public.payment_methods to anon,authenticated;
grant update on public.settings to authenticated;
grant insert,update on public.products,public.payment_methods to authenticated;
grant select on public.orders,public.order_events to authenticated;
grant all on public.settings,public.products,public.payment_methods,public.orders,public.order_events to service_role;
grant usage,select on sequence public.order_events_id_seq to service_role;

create index if not exists zyha_products_catalog_idx on public.products(is_active,category,created_at desc,id);
create index if not exists zyha_products_price_idx on public.products(is_active,price,id);
create index if not exists zyha_orders_created_idx on public.orders(created_at desc,id);
create index if not exists zyha_orders_status_idx on public.orders(status,created_at desc,id);
create index if not exists zyha_orders_payment_method_idx on public.orders(payment_method_id);
create index if not exists zyha_events_order_idx on public.order_events(order_id,created_at desc);

-- All guest order functions below are SERVICE ONLY: Edge applies validation,
-- rate limiting and receipt proof before any private order data is returned.
create or replace function public.zyha_rate_limit(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare b bigint; n integer;
begin
 if length(p_key)>200 or p_limit<1 or p_seconds<1 then raise exception 'Invalid limiter arguments'; end if;
 b=floor(extract(epoch from now())/p_seconds);
 insert into zyha_private.request_limits(key,bucket,hits) values(p_key,b,1)
 on conflict(key,bucket) do update set hits=zyha_private.request_limits.hits+1,updated_at=now() returning hits into n;
 delete from zyha_private.request_limits where updated_at < now()-interval '1 day';
 return n<=p_limit;
end $$;
create or replace function public.zyha_place_order(
 p_request_id uuid,p_receipt_token text,p_request_hash text,p_items jsonb,
 p_customer jsonb,p_method_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare old_order public.orders; s public.settings; m public.payment_methods; p public.products;
 line jsonb; snapshots jsonb='[]'; q integer; variant text; pid uuid; oid uuid=gen_random_uuid();
 sub bigint=0; fee bigint; total_weight bigint=0; cname text; addr text; district text; city text; province text; postal_code text; phone text; note text;
begin
 if p_request_id is null or p_receipt_token is null or p_receipt_token !~ '^[0-9a-f]{64}$' or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then raise exception 'Permintaan checkout tidak valid'; end if;
 -- Serialize retries before checking uniqueness. Same UUID+proof must return same order.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
 select * into old_order from public.orders where request_id=p_request_id;
 if found then
  if old_order.receipt_hash<>encode(extensions.digest(p_receipt_token,'sha256'),'hex') or old_order.request_hash<>p_request_hash then raise exception 'Permintaan sebelumnya berbeda. Muat ulang checkout.'; end if;
  return old_order.id;
 end if;
 cname=btrim(p_customer->>'name');addr=btrim(p_customer->>'address');district=btrim(p_customer->>'district');city=btrim(p_customer->>'city');province=btrim(p_customer->>'province');postal_code=btrim(p_customer->>'postal_code');phone=p_customer->>'phone';note=btrim(coalesce(p_customer->>'note',''));
 if cname is null or length(cname) not between 2 and 120 or addr is null or length(addr) not between 10 and 500 or district is null or length(district) not between 2 and 100 or city is null or length(city) not between 2 and 100 or province is null or length(province) not between 2 and 100 or postal_code is null or postal_code !~ '^[0-9]{5}$' or phone is null or phone !~ '^62[0-9]{8,13}$' or length(note)>500 then raise exception 'Data pengiriman tidak valid'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Keranjang tidak valid'; end if;
 if (select count(*) from jsonb_array_elements(p_items)) <> (select count(distinct (value->>'product_id',coalesce(value->>'variant',''))) from jsonb_array_elements(p_items)) then raise exception 'Baris produk duplikat'; end if;
 select * into s from public.settings where id=1 for share;
 select * into m from public.payment_methods where id=p_method_id and is_active for share;
 if not found then raise exception 'Metode pembayaran tidak tersedia'; end if;
 -- Lock products in deterministic order to avoid overselling and deadlocks.
 perform 1 from public.products where id in(select (value->>'product_id')::uuid from jsonb_array_elements(p_items)) order by id for update;
 for line in select value from jsonb_array_elements(p_items) loop
  if coalesce(line->>'quantity','') !~ '^[1-9][0-9]?$' then raise exception 'Jumlah harus 1–99'; end if;
  q=(line->>'quantity')::integer;pid=(line->>'product_id')::uuid;variant=coalesce(line->>'variant','');
  select * into p from public.products where id=pid and is_active;
  if not found then raise exception 'Produk tidak tersedia'; end if;
  if (jsonb_array_length(p.variants)>0 and not exists(select 1 from jsonb_array_elements(p.variants) v where v->>'name'=variant)) or (jsonb_array_length(p.variants)=0 and variant<>'') then raise exception 'Varian produk tidak valid'; end if;
  if p.stock is not null and p.stock<q then raise exception 'Stok produk % tidak cukup',p.title; end if;
  sub=sub+p.price*q;
  if sub>1000000000 then raise exception 'Total pesanan melewati batas'; end if;
  snapshots=snapshots||jsonb_build_array(jsonb_build_object('product_id',p.id,'title',p.title,'category',p.category,'variant',variant,'image',p.image_url,'quantity',q,'unit_price',p.price,'subtotal',p.price*q,'stock_tracked',p.stock is not null,'weight_grams',p.weight_grams));
  total_weight=total_weight+(p.weight_grams::bigint*q);
  if total_weight>100000000000 then raise exception 'Berat pesanan melewati batas'; end if;
  if p.stock is not null then update public.products set stock=stock-q where id=p.id; end if;
 end loop;
 fee=case when s.free_shipping_min is not null and sub>=s.free_shipping_min then 0 else s.shipping_fee end;
 if sub+fee>1000000000 then raise exception 'Total pesanan melewati batas'; end if;
 insert into public.orders(id,order_number,request_id,receipt_hash,request_hash,customer_name,customer_address,customer_district,customer_city,customer_province,customer_postal_code,customer_phone,customer_note,items,subtotal,shipping_fee,total_price,total_weight_grams,payment_method_id,payment_method,payment_snapshot)
 values(oid,'ZYHA-'||upper(replace(oid::text,'-','')),p_request_id,encode(extensions.digest(p_receipt_token,'sha256'),'hex'),p_request_hash,cname,addr,district,city,province,postal_code,phone,note,snapshots,sub,fee,sub+fee,total_weight,m.id,m.name,to_jsonb(m));
 insert into public.order_events(order_id,event,new_status,note) values(oid,'order_created','pending','Pesanan dibuat; harga dan stok divalidasi database.');
 return oid;
end $$;
create or replace function public.zyha_receipt(p_request_id uuid,p_receipt_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.orders;
begin
 if p_receipt_token is null or p_receipt_token !~ '^[0-9a-f]{64}$' then raise exception 'Pesanan tidak ditemukan'; end if;
 select * into r from public.orders where request_id=p_request_id and receipt_hash=encode(extensions.digest(p_receipt_token,'sha256'),'hex') and created_at>now()-interval '30 days';
 if not found then raise exception 'Pesanan tidak ditemukan atau akses bukti kedaluwarsa'; end if;
 return jsonb_build_object('id',r.id,'order_number',r.order_number,'items',r.items,'subtotal',r.subtotal,'shipping_fee',r.shipping_fee,'total_price',r.total_price,'status',r.status,'payment_method',r.payment_method,'payment_snapshot',r.payment_snapshot,'fulfillment_status',r.fulfillment_status,'tracking_number',r.tracking_number,'carrier',r.carrier,'created_at',r.created_at);
end $$;

create or replace function public.zyha_restore_stock(p_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.orders; line jsonb;
begin
 select * into r from public.orders where id=p_order_id for update;
 if not found or r.stock_restored then return; end if;
 perform 1 from public.products where id in(select (value->>'product_id')::uuid from jsonb_array_elements(r.items)) order by id for update;
 for line in select value from jsonb_array_elements(r.items) loop
  if (line->>'stock_tracked')::boolean then update public.products set stock=stock+(line->>'quantity')::integer where id=(line->>'product_id')::uuid and stock is not null; end if;
 end loop;
 update public.orders set stock_restored=true where id=r.id;
end $$;
create or replace function public.zyha_admin_order_action(p_id uuid,p_version bigint,p_action text,p_note text,p_tracking text default '',p_carrier text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.orders; next_status text; next_fulfillment text;
begin
 if not public.zyha_is_admin() then raise exception 'Akses Admin diperlukan'; end if;
 if p_note is null or length(btrim(p_note)) not between 3 and 2000 then raise exception 'Isi alasan minimal 3 karakter'; end if;
 select * into r from public.orders where id=p_id for update;
 if not found then raise exception 'Pesanan tidak ditemukan'; end if;
 if p_version is null or r.version<>p_version then raise exception 'Pesanan telah diperbarui. Muat ulang sebelum mengubah.'; end if;
 next_status=r.status; next_fulfillment=r.fulfillment_status;
 if p_action in ('paid','cancelled') then
  if r.status<>'pending' then raise exception 'Hanya pembayaran tertunda yang dapat diverifikasi/dibatalkan'; end if;
  next_status=p_action;
  if p_action='cancelled' then perform public.zyha_restore_stock(r.id); end if;
 elsif p_action in ('processing','shipped','completed') then
  if r.status not in ('paid','partial_refund') then raise exception 'Pesanan harus lunas sebelum diproses'; end if;
  if not ((r.fulfillment_status='unfulfilled' and p_action='processing') or (r.fulfillment_status='processing' and p_action='shipped') or (r.fulfillment_status='shipped' and p_action='completed')) then raise exception 'Urutan status pengiriman tidak valid'; end if;
  if p_action='shipped' and (coalesce(length(btrim(p_tracking)),0)=0 or coalesce(length(btrim(p_carrier)),0)=0) then raise exception 'Isi kurir dan nomor resi'; end if;
  next_fulfillment=p_action;
 else raise exception 'Tindakan tidak valid'; end if;
 update public.orders set status=next_status,fulfillment_status=next_fulfillment,
 tracking_number=case when p_action='shipped' then btrim(p_tracking) else tracking_number end,
 carrier=case when p_action='shipped' then btrim(p_carrier) else carrier end,
 version=version+1,updated_at=clock_timestamp() where id=r.id;
 insert into public.order_events(order_id,actor_id,event,old_status,new_status,note) values(r.id,auth.uid(),'admin_'||p_action,r.status,next_status,btrim(p_note));
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.zyha_dashboard(p_start timestamptz default null,p_end timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.zyha_is_admin() then raise exception 'Akses Admin diperlukan'; end if;
 if p_start is not null and p_end is not null and p_start>=p_end then raise exception 'Periode tidak valid'; end if;
 with filtered as (select * from public.orders where (p_start is null or created_at>=p_start) and (p_end is null or created_at<p_end)),
 statuses as(select status,count(*) as count from filtered group by status),
 top_items as(select item->>'title' title,sum((item->>'quantity')::integer) quantity,sum((item->>'subtotal')::bigint) revenue from filtered f cross join lateral jsonb_array_elements(f.items) item where f.status in ('paid','partial_refund') group by item->>'title' order by revenue desc limit 10)
 select jsonb_build_object('revenue',coalesce((select sum(total_price-refund_amount) from filtered where status in ('paid','partial_refund')),0),'orders',(select count(*) from filtered),'pending',(select count(*) from filtered where status='pending'),'products',(select count(*) from public.products where is_active),'statuses',coalesce((select jsonb_agg(to_jsonb(statuses)) from statuses),'[]'::jsonb),'top_products',coalesce((select jsonb_agg(to_jsonb(top_items)) from top_items),'[]'::jsonb)) into result;
 return result;
end $$;

-- Do not use broad 'grant execute on all functions' here.
revoke all on function public.zyha_touch(),public.zyha_product_guard(),public.zyha_restore_stock(uuid) from public,anon,authenticated;
revoke all on function public.zyha_rate_limit(text,integer,integer),public.zyha_place_order(uuid,text,text,jsonb,jsonb,uuid),public.zyha_receipt(uuid,text) from public,anon,authenticated;
grant execute on function public.zyha_rate_limit(text,integer,integer),public.zyha_place_order(uuid,text,text,jsonb,jsonb,uuid),public.zyha_receipt(uuid,text) to service_role;
revoke all on function public.zyha_admin_order_action(uuid,bigint,text,text,text,text),public.zyha_dashboard(timestamptz,timestamptz) from public,anon;
grant execute on function public.zyha_admin_order_action(uuid,bigint,text,text,text,text),public.zyha_dashboard(timestamptz,timestamptz) to authenticated,service_role;

-- The products bucket holds public catalog/QRIS/banner images ONLY, never identity
-- documents or payment proofs. Only an active administrator may upload/delete.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('products','products',true,5242880,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do nothing;
drop policy if exists zyha_images_insert on storage.objects;
create policy zyha_images_insert on storage.objects for insert to authenticated with check(bucket_id='products' and (select public.zyha_is_admin()));
drop policy if exists zyha_images_update on storage.objects;
create policy zyha_images_update on storage.objects for update to authenticated using(bucket_id='products' and (select public.zyha_is_admin())) with check(bucket_id='products' and (select public.zyha_is_admin()));
drop policy if exists zyha_images_delete on storage.objects;
create policy zyha_images_delete on storage.objects for delete to authenticated using(bucket_id='products' and (select public.zyha_is_admin()));
drop policy if exists zyha_images_admin_read on storage.objects;
create policy zyha_images_admin_read on storage.objects for select to authenticated using(bucket_id='products' and (select public.zyha_is_admin()));

do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['products','settings','payment_methods','orders','admin_users'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
  end loop;
 end if;
end $$;
do $$ declare v_admin_email text=btrim(current_setting('zyha.bootstrap_admin_email',true)); uid uuid; begin
 if coalesce(v_admin_email,'')<>'' then
  select id into uid from auth.users where lower(auth.users.email)=lower(v_admin_email) and email_confirmed_at is not null;
  if uid is null then raise exception 'Buat/konfirmasi user Auth dengan email Admin tersebut terlebih dahulu'; end if;
  insert into public.admin_users(user_id) values(uid) on conflict(user_id) do update set is_active=true;
 end if;
end $$;
notify pgrst, 'reload schema';
commit;
