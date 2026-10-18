-- Biteship checkout, quote validation, and shipment booking foundation.
-- Run after migrations 20261010000000 through 20261014000000.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';

alter table public.settings
  add column if not exists shipping_provider text not null default 'flat_rate',
  add column if not exists shipping_couriers text not null default 'jne,sicepat,anteraja,pos,tiki';
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.settings'::regclass and conname='zyha_settings_shipping_provider') then
    alter table public.settings add constraint zyha_settings_shipping_provider check(shipping_provider in ('flat_rate','biteship'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.settings'::regclass and conname='zyha_settings_shipping_couriers') then
    alter table public.settings add constraint zyha_settings_shipping_couriers check(length(shipping_couriers) between 1 and 200);
  end if;
end $$;

alter table public.shipping_origin
  add column if not exists provider_location_id text not null default '';
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.shipping_origin'::regclass and conname='zyha_shipping_origin_provider_location_id') then
    alter table public.shipping_origin add constraint zyha_shipping_origin_provider_location_id check(length(provider_location_id)<=120);
  end if;
end $$;

alter table public.products
  add column if not exists length_cm integer not null default 0,
  add column if not exists width_cm integer not null default 0,
  add column if not exists height_cm integer not null default 0;
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.products'::regclass and conname='zyha_products_dimensions_range') then
    alter table public.products add constraint zyha_products_dimensions_range check(
      length_cm between 0 and 10000 and width_cm between 0 and 10000 and height_cm between 0 and 10000
    );
  end if;
end $$;

alter table public.orders
  add column if not exists shipping_service_key text not null default '',
  add column if not exists shipping_courier_name text not null default '',
  add column if not exists shipping_service_name text not null default '';
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='zyha_orders_shipping_service_key') then
    alter table public.orders add constraint zyha_orders_shipping_service_key check(length(shipping_service_key)<=128);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='zyha_orders_shipping_names') then
    alter table public.orders add constraint zyha_orders_shipping_names check(length(shipping_courier_name)<=120 and length(shipping_service_name)<=120);
  end if;
end $$;

alter table zyha_private.shipping_quotes
  add column if not exists parcel_items jsonb not null default '[]'::jsonb,
  add column if not exists order_id uuid references public.orders(id) on delete restrict;
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='zyha_private.shipping_quotes'::regclass and conname='zyha_shipping_quote_items_shape') then
    alter table zyha_private.shipping_quotes add constraint zyha_shipping_quote_items_shape
      check(jsonb_typeof(parcel_items)='array' and jsonb_array_length(parcel_items)<=50);
  end if;
end $$;
create unique index if not exists zyha_shipping_quote_order on zyha_private.shipping_quotes(order_id) where order_id is not null;

alter table public.shipping_shipments
  add column if not exists provider_error text not null default '';
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.shipping_shipments'::regclass and conname='zyha_shipping_shipment_error_range') then
    alter table public.shipping_shipments add constraint zyha_shipping_shipment_error_range check(length(provider_error)<=500);
  end if;
end $$;
create unique index if not exists zyha_shipping_shipment_order on public.shipping_shipments(order_id);

create or replace function public.zyha_create_biteship_quote(
  p_id uuid,p_origin jsonb,p_destination jsonb,p_weight integer,
  p_items jsonb,p_services jsonb,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Akses server diperlukan';
  end if;
  if p_id is null or jsonb_typeof(p_origin)<>'object' or jsonb_typeof(p_destination)<>'object'
    or p_weight not between 1 and 100000000 or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items) not between 1 and 50 or jsonb_typeof(p_services)<>'array'
    or jsonb_array_length(p_services) not between 1 and 100 or p_expires_at<=now() then
    raise exception 'Data tarif pengiriman tidak valid';
  end if;
  insert into zyha_private.shipping_quotes(id,provider_code,origin,destination,parcel_weight_grams,parcel_items,services,expires_at)
  values(p_id,'biteship',p_origin,p_destination,p_weight,p_items,p_services,p_expires_at);
  return p_id;
end $$;
revoke all on function public.zyha_create_biteship_quote(uuid,jsonb,jsonb,integer,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.zyha_create_biteship_quote(uuid,jsonb,jsonb,integer,jsonb,jsonb,timestamptz) to service_role;

create or replace function public.zyha_place_order_with_biteship(
  p_request_id uuid, p_receipt_token text, p_request_hash text, p_items jsonb,
  p_customer jsonb, p_method_id uuid, p_coupon_code text, p_customer_key text,
  p_quote_id uuid, p_service_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  oid uuid;
  o public.orders;
  q zyha_private.shipping_quotes;
  selected_service jsonb;
  shipping_amount bigint;
  s public.settings;
  origin_row public.shipping_origin;
begin
  oid := public.zyha_place_order_with_coupon(
    p_request_id,p_receipt_token,p_request_hash,p_items,p_customer,p_method_id,p_coupon_code,p_customer_key
  );
  select * into o from public.orders where id=oid for update;
  if o.shipping_quote_id is not null then
    if o.shipping_quote_id<>p_quote_id or o.shipping_service_key<>p_service_key then
      raise exception 'Permintaan sebelumnya menggunakan tarif berbeda';
    end if;
    return oid;
  end if;
  select * into s from public.settings where id=1;
  if not found or s.shipping_provider<>'biteship' then
    raise exception 'Tarif Biteship tidak sedang aktif';
  end if;
  if p_quote_id is null or p_service_key is null or p_service_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Tarif pengiriman tidak valid';
  end if;
  select * into q from zyha_private.shipping_quotes where id=p_quote_id for update;
  if not found or q.provider_code<>'biteship' or q.expires_at<=now() then
    raise exception 'Tarif pengiriman kedaluwarsa. Hitung kembali tarif.';
  end if;
  select * into origin_row from public.shipping_origin where id=1 for share;
  if not found or q.origin->>'area_id' is distinct from origin_row.provider_location_id then
    raise exception 'Lokasi gudang berubah. Hitung kembali tarif.';
  end if;
  if q.destination->>'area_id' is distinct from p_customer->>'destination_area_id' then
    raise exception 'Lokasi tujuan berubah. Hitung kembali tarif.';
  end if;
  if q.destination->>'postal_code' is distinct from p_customer->>'postal_code' then
    raise exception 'Kode pos tujuan berubah. Hitung kembali tarif.';
  end if;
  select value into selected_service
    from jsonb_array_elements(q.services) value
    where value->>'key'=p_service_key
    limit 1;
  if selected_service is null then raise exception 'Layanan kurir tidak termasuk dalam tarif ini'; end if;
  if coalesce(selected_service->>'amount','') !~ '^[0-9]{1,10}$' then
    raise exception 'Nominal tarif tidak valid';
  end if;
  shipping_amount=(selected_service->>'amount')::bigint;
  if shipping_amount<0 or shipping_amount>1000000000 then raise exception 'Nominal tarif di luar batas'; end if;

  if q.parcel_weight_grams<>o.total_weight_grams then
    raise exception 'Berat keranjang berubah. Hitung kembali tarif.';
  end if;
  if jsonb_array_length(q.parcel_items)<>jsonb_array_length(o.items)
    or exists(
      select 1 from jsonb_array_elements(q.parcel_items) as parcel(value)
      where not exists(
        select 1 from jsonb_array_elements(o.items) as line(value)
        where line.value->>'product_id'=parcel.value->>'product_id'
          and coalesce(line.value->>'variant','')=coalesce(parcel.value->>'variant','')
          and line.value->>'quantity'=parcel.value->>'quantity'
          and line.value->>'unit_price'=parcel.value->>'value'
          and line.value->>'weight_grams'=parcel.value->>'weight'
      )
    ) then raise exception 'Isi atau harga keranjang berubah. Hitung kembali tarif.';
  end if;
  if exists(
    select 1 from jsonb_array_elements(q.parcel_items) as parcel(value)
    where not exists(
      select 1 from public.products p
      where p.id=(parcel.value->>'product_id')::uuid
        and p.length_cm::text=parcel.value->>'length'
        and p.width_cm::text=parcel.value->>'width'
        and p.height_cm::text=parcel.value->>'height'
    )
  ) then raise exception 'Dimensi produk berubah. Hitung kembali tarif.'; end if;
  if q.order_id is not null and q.order_id<>oid then
    raise exception 'Tarif ini sudah digunakan pesanan lain';
  end if;
  update zyha_private.shipping_quotes set order_id=oid where id=q.id;
  update public.orders
    set shipping_fee=shipping_amount,
        total_price=subtotal+shipping_amount-discount_amount,
        shipping_quote_id=q.id,
        shipping_service_key=p_service_key,
        shipping_courier_name=left(selected_service->>'courier_name',120),
        shipping_service_name=left(selected_service->>'service_name',120)
    where id=oid;
  return oid;
end $$;
revoke all on function public.zyha_place_order_with_biteship(uuid,text,text,jsonb,jsonb,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.zyha_place_order_with_biteship(uuid,text,text,jsonb,jsonb,uuid,text,text,uuid,text) to service_role;

create or replace function public.zyha_begin_biteship_shipment(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  q zyha_private.shipping_quotes;
  service jsonb;
  origin_row public.shipping_origin;
  prior public.shipping_shipments;
  shipment_request_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Akses server diperlukan';
  end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status not in ('paid','partial_refund') or o.fulfillment_status<>'processing' then
    raise exception 'Pesanan harus lunas dan sedang diproses sebelum booking kurir';
  end if;
  if o.shipping_quote_id is null or o.shipping_service_key='' then
    raise exception 'Pesanan tidak memiliki tarif Biteship';
  end if;
  select * into prior from public.shipping_shipments where order_id=o.id;
  if found then
    if prior.status='booked' then return jsonb_build_object('already_booked',true,'shipment',to_jsonb(prior)); end if;
    raise exception 'Booking pengiriman sudah dimulai. Periksa status di Biteship sebelum melakukan tindakan lanjutan.';
  end if;
  select * into q from zyha_private.shipping_quotes where id=o.shipping_quote_id and order_id=o.id;
  if not found then raise exception 'Kutipan tarif pesanan tidak ditemukan'; end if;
  select value into service from jsonb_array_elements(q.services) value where value->>'key'=o.shipping_service_key limit 1;
  if service is null then raise exception 'Layanan kurir pesanan tidak ditemukan'; end if;
  select * into origin_row from public.shipping_origin where id=1;
  if not found or origin_row.provider_location_id='' or origin_row.name='' or origin_row.phone !~ '^62[0-9]{8,13}$'
    or length(origin_row.address)<5 or origin_row.postal_code !~ '^[0-9]{5}$' then
    raise exception 'Lengkapi kontak, alamat, kode pos, dan ID area asal Biteship';
  end if;
  if q.origin->>'area_id' is distinct from origin_row.provider_location_id then
    raise exception 'Lokasi gudang berubah setelah tarif dihitung; periksa kembali konfigurasi pengiriman';
  end if;
  shipment_request_id=gen_random_uuid();
  insert into public.shipping_shipments(order_id,provider_request_id,provider_code,carrier_code,carrier_name,service_code,service_name,status)
  values(o.id,shipment_request_id,'biteship',service->>'courier_code',service->>'courier_name',service->>'service_code',service->>'service_name','created');
  return jsonb_build_object(
    'already_booked',false,
    'provider_request_id',shipment_request_id,
    'order',to_jsonb(o),
    'origin',to_jsonb(origin_row),
    'quote',to_jsonb(q),
    'service',service
  );
end $$;
revoke all on function public.zyha_begin_biteship_shipment(uuid) from public,anon,authenticated;
grant execute on function public.zyha_begin_biteship_shipment(uuid) to service_role;

create or replace function public.zyha_complete_biteship_shipment(
  p_order_id uuid,p_provider_shipment_id text,p_tracking_number text,
  p_label_url text,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  sh public.shipping_shipments;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Akses server diperlukan';
  end if;
  if length(coalesce(p_provider_shipment_id,'')) not between 1 and 200
    or length(coalesce(p_tracking_number,''))>120
    or (p_label_url<>'' and p_label_url !~ '^https://')
    or p_status not in ('booked','picked_up','in_transit','delivered') then
    raise exception 'Respons booking Biteship tidak valid';
  end if;
  select * into o from public.orders where id=p_order_id for update;
  select * into sh from public.shipping_shipments where order_id=p_order_id for update;
  if not found or sh.status<>'created' then raise exception 'Reservasi booking tidak tersedia'; end if;
  if o.status not in ('paid','partial_refund') or o.fulfillment_status<>'processing' then
    raise exception 'Status pesanan berubah sebelum booking selesai';
  end if;
  update public.shipping_shipments
    set provider_shipment_id=p_provider_shipment_id,tracking_number=p_tracking_number,
        label_url=p_label_url,status=p_status,provider_error=''
    where id=sh.id;
  update public.orders
    set tracking_number=p_tracking_number,
        carrier=sh.carrier_name,
        fulfillment_status='shipped',
        version=version+1
    where id=o.id;
  insert into public.order_events(order_id,event,old_status,new_status,note)
  values(o.id,'biteship_shipment_booked',o.status,o.status,'Shipment Biteship berhasil dibuat; ID provider '||p_provider_shipment_id);
end $$;
revoke all on function public.zyha_complete_biteship_shipment(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.zyha_complete_biteship_shipment(uuid,text,text,text,text) to service_role;

create or replace function public.zyha_fail_biteship_shipment(p_order_id uuid,p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Akses server diperlukan';
  end if;
  update public.shipping_shipments
    set status='failed',provider_error=left(coalesce(p_error,'Booking provider gagal'),500)
    where order_id=p_order_id and status='created';
  if not found then raise exception 'Reservasi booking tidak tersedia'; end if;
end $$;
revoke all on function public.zyha_fail_biteship_shipment(uuid,text) from public,anon,authenticated;
grant execute on function public.zyha_fail_biteship_shipment(uuid,text) to service_role;

create or replace function public.zyha_receipt(p_request_id uuid,p_receipt_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.orders;
begin
  if p_receipt_token is null or p_receipt_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Pesanan tidak ditemukan';
  end if;
  select * into r from public.orders
    where request_id=p_request_id
      and receipt_hash=encode(extensions.digest(p_receipt_token,'sha256'),'hex')
      and created_at>now()-interval '30 days';
  if not found then raise exception 'Pesanan tidak ditemukan atau akses bukti kedaluwarsa'; end if;
  return jsonb_build_object(
    'id',r.id,'order_number',r.order_number,'items',r.items,'subtotal',r.subtotal,
    'shipping_fee',r.shipping_fee,'shipping_quote_id',r.shipping_quote_id,
    'shipping_service_key',r.shipping_service_key,'shipping_courier_name',r.shipping_courier_name,
    'shipping_service_name',r.shipping_service_name,'coupon_code',r.coupon_code,
    'discount_amount',r.discount_amount,'total_price',r.total_price,'status',r.status,
    'payment_method',r.payment_method,'payment_snapshot',r.payment_snapshot,
    'fulfillment_status',r.fulfillment_status,'tracking_number',r.tracking_number,
    'carrier',r.carrier,'created_at',r.created_at
  );
end $$;
revoke all on function public.zyha_receipt(uuid,text) from public,anon,authenticated;
grant execute on function public.zyha_receipt(uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
