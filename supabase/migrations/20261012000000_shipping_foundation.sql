-- Provider-neutral shipping foundation. Does not enable a carrier or call its API.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';

alter table public.settings
  add column if not exists shipping_fee bigint not null default 0;
alter table public.settings
  add column if not exists free_shipping_min bigint;

alter table public.products
  add column if not exists weight_grams integer not null default 0;
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.products'::regclass and conname='zyha_products_weight_range') then
    alter table public.products add constraint zyha_products_weight_range check(weight_grams between 0 and 100000000);
  end if;
end $$;

alter table public.orders
  add column if not exists customer_district text not null default '',
  add column if not exists customer_city text not null default '',
  add column if not exists customer_province text not null default '',
  add column if not exists customer_postal_code text not null default '',
  add column if not exists total_weight_grams bigint not null default 0;
alter table public.orders drop constraint if exists orders_customer_address_check;
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='zyha_orders_customer_address_range') then
    alter table public.orders add constraint zyha_orders_customer_address_range check(length(customer_address) between 10 and 1000);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='zyha_orders_recipient_fields') then
    alter table public.orders add constraint zyha_orders_recipient_fields check(
      length(customer_district)<=100 and length(customer_city)<=100 and length(customer_province)<=100
      and (customer_postal_code='' or customer_postal_code ~ '^[0-9]{5}$')
    );
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='zyha_orders_total_weight_range') then
    alter table public.orders add constraint zyha_orders_total_weight_range check(total_weight_grams between 0 and 100000000000);
  end if;
end $$;

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
drop trigger if exists zyha_touch_shipping_origin on public.shipping_origin;
create trigger zyha_touch_shipping_origin before update on public.shipping_origin for each row execute function public.zyha_touch();
alter table public.shipping_origin enable row level security;
drop policy if exists zyha_shipping_origin_admin on public.shipping_origin;
create policy zyha_shipping_origin_admin on public.shipping_origin for all to authenticated
  using((select public.zyha_is_admin())) with check((select public.zyha_is_admin()));
revoke all on public.shipping_origin from public,anon,authenticated;
grant select,update on public.shipping_origin to authenticated;
grant all on public.shipping_origin to service_role;

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
drop trigger if exists zyha_touch_shipping_shipments on public.shipping_shipments;
create trigger zyha_touch_shipping_shipments before update on public.shipping_shipments for each row execute function public.zyha_touch();
alter table public.shipping_shipments enable row level security;
drop policy if exists zyha_shipping_shipments_admin_read on public.shipping_shipments;
create policy zyha_shipping_shipments_admin_read on public.shipping_shipments for select to authenticated using((select public.zyha_is_admin()));
revoke all on public.shipping_shipments from public,anon,authenticated;
grant select on public.shipping_shipments to authenticated;
grant all on public.shipping_shipments to service_role;

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

create or replace function public.zyha_place_order(
  p_request_id uuid,p_receipt_token text,p_request_hash text,p_items jsonb,
  p_customer jsonb,p_method_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 old_order public.orders; s public.settings; m public.payment_methods; p public.products;
 line jsonb; snapshots jsonb='[]'; q integer; variant text; pid uuid; oid uuid=gen_random_uuid();
 sub bigint=0; fee bigint; total_weight bigint=0; cname text; addr text; district text;
 city text; province text; postal_code text; phone text; note text;
begin
 if p_request_id is null or p_receipt_token is null or p_receipt_token !~ '^[0-9a-f]{64}$'
   or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then raise exception 'Permintaan checkout tidak valid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into old_order from public.orders where request_id=p_request_id;
 if found then
  if old_order.receipt_hash<>encode(extensions.digest(p_receipt_token,'sha256'),'hex')
    or old_order.request_hash<>p_request_hash then raise exception 'Permintaan sebelumnya berbeda. Muat ulang checkout.'; end if;
  return old_order.id;
 end if;
 cname=btrim(p_customer->>'name'); addr=btrim(p_customer->>'address');
 district=btrim(p_customer->>'district'); city=btrim(p_customer->>'city');
 province=btrim(p_customer->>'province'); postal_code=btrim(p_customer->>'postal_code');
 phone=p_customer->>'phone'; note=btrim(coalesce(p_customer->>'note',''));
 if cname is null or length(cname) not between 2 and 120 or addr is null or length(addr) not between 10 and 500
   or district is null or length(district) not between 2 and 100 or city is null or length(city) not between 2 and 100
   or province is null or length(province) not between 2 and 100 or postal_code is null or postal_code !~ '^[0-9]{5}$'
   or phone is null or phone !~ '^62[0-9]{8,13}$' or length(note)>500 then raise exception 'Data pengiriman tidak valid'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Keranjang tidak valid'; end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct (value->>'product_id',coalesce(value->>'variant',''))) from jsonb_array_elements(p_items)) then raise exception 'Baris produk duplikat'; end if;
 select * into s from public.settings where id=1 for share;
 select * into m from public.payment_methods where id=p_method_id and is_active for share;
 if not found then raise exception 'Metode pembayaran tidak tersedia'; end if;
 perform 1 from public.products where id in(select (value->>'product_id')::uuid from jsonb_array_elements(p_items)) order by id for update;
 for line in select value from jsonb_array_elements(p_items) loop
  if coalesce(line->>'quantity','') !~ '^[1-9][0-9]?$' then raise exception 'Jumlah harus 1–99'; end if;
  q=(line->>'quantity')::integer; pid=(line->>'product_id')::uuid; variant=coalesce(line->>'variant','');
  select * into p from public.products where id=pid and is_active;
  if not found then raise exception 'Produk tidak tersedia'; end if;
  if (jsonb_array_length(p.variants)>0 and not exists(select 1 from jsonb_array_elements(p.variants) v where v->>'name'=variant))
    or (jsonb_array_length(p.variants)=0 and variant<>'') then raise exception 'Varian produk tidak valid'; end if;
  if p.stock is not null and p.stock<q then raise exception 'Stok produk % tidak cukup',p.title; end if;
  sub=sub+p.price*q;
  if sub>1000000000 then raise exception 'Total pesanan melewati batas'; end if;
  total_weight=total_weight+(p.weight_grams::bigint*q);
  if total_weight>100000000000 then raise exception 'Berat pesanan melewati batas'; end if;
  snapshots=snapshots||jsonb_build_array(jsonb_build_object('product_id',p.id,'title',p.title,'category',p.category,'variant',variant,'image',p.image_url,'quantity',q,'unit_price',p.price,'subtotal',p.price*q,'stock_tracked',p.stock is not null,'weight_grams',p.weight_grams));
  if p.stock is not null then update public.products set stock=stock-q where id=p.id; end if;
 end loop;
 fee=case when s.free_shipping_min is not null and sub>=s.free_shipping_min then 0 else s.shipping_fee end;
 if sub+fee>1000000000 then raise exception 'Total pesanan melewati batas'; end if;
 insert into public.orders(id,order_number,request_id,receipt_hash,request_hash,customer_name,customer_address,customer_district,customer_city,customer_province,customer_postal_code,customer_phone,customer_note,items,subtotal,shipping_fee,total_price,total_weight_grams,payment_method_id,payment_method,payment_snapshot)
 values(oid,'ZYHA-'||upper(replace(oid::text,'-','')),p_request_id,encode(extensions.digest(p_receipt_token,'sha256'),'hex'),p_request_hash,cname,addr,district,city,province,postal_code,phone,note,snapshots,sub,fee,sub+fee,total_weight,m.id,m.name,to_jsonb(m));
 insert into public.order_events(order_id,event,new_status,note) values(oid,'order_created','pending','Pesanan dibuat; harga dan stok divalidasi database.');
 return oid;
end $$;
revoke all on function public.zyha_place_order(uuid,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.zyha_place_order(uuid,text,text,jsonb,jsonb,uuid) to service_role;

notify pgrst,'reload schema';
commit;
