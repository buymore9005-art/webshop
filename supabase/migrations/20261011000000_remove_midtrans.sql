-- Retire payment-provider integration from projects created with the previous schema.
-- Existing order/payment snapshots remain available as historical records.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

drop function if exists public.zyha_cancel_unstarted(uuid, bigint, text, uuid);
drop function if exists public.zyha_claim_payment(uuid);
drop function if exists public.zyha_save_payment(uuid, uuid, text, text);
drop function if exists public.zyha_apply_gateway_status(uuid, text, bigint, text, bigint, text);

create or replace function public.zyha_place_order(
  p_request_id uuid, p_receipt_token text, p_request_hash text, p_items jsonb,
  p_customer jsonb, p_method_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  old_order public.orders;
  s public.settings;
  m public.payment_methods;
  p public.products;
  line jsonb;
  snapshots jsonb = '[]';
  q integer;
  variant text;
  pid uuid;
  oid uuid = gen_random_uuid();
  sub bigint = 0;
  fee bigint;
  cname text;
  addr text;
  phone text;
  note text;
begin
  if p_request_id is null or p_receipt_token is null or p_receipt_token !~ '^[0-9a-f]{64}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Permintaan checkout tidak valid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into old_order from public.orders where request_id = p_request_id;
  if found then
    if old_order.receipt_hash <> encode(extensions.digest(p_receipt_token, 'sha256'), 'hex')
       or old_order.request_hash <> p_request_hash then
      raise exception 'Permintaan sebelumnya berbeda. Muat ulang checkout.';
    end if;
    return old_order.id;
  end if;
  cname = btrim(p_customer->>'name');
  addr = btrim(p_customer->>'address');
  phone = p_customer->>'phone';
  note = btrim(coalesce(p_customer->>'note', ''));
  if cname is null or length(cname) not between 2 and 120
     or addr is null or length(addr) not between 10 and 1000
     or phone is null or phone !~ '^62[0-9]{8,13}$' or length(note) > 500 then
    raise exception 'Data pengiriman tidak valid';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Keranjang tidak valid';
  end if;
  if (select count(*) from jsonb_array_elements(p_items))
     <> (select count(distinct (value->>'product_id', coalesce(value->>'variant', '')))
         from jsonb_array_elements(p_items)) then
    raise exception 'Baris produk duplikat';
  end if;
  select * into s from public.settings where id = 1 for share;
  select * into m from public.payment_methods where id = p_method_id and is_active for share;
  if not found then raise exception 'Metode pembayaran tidak tersedia'; end if;
  perform 1 from public.products
    where id in (select (value->>'product_id')::uuid from jsonb_array_elements(p_items))
    order by id for update;
  for line in select value from jsonb_array_elements(p_items) loop
    if coalesce(line->>'quantity', '') !~ '^[1-9][0-9]?$' then raise exception 'Jumlah harus 1–99'; end if;
    q = (line->>'quantity')::integer;
    pid = (line->>'product_id')::uuid;
    variant = coalesce(line->>'variant', '');
    select * into p from public.products where id = pid and is_active;
    if not found then raise exception 'Produk tidak tersedia'; end if;
    if (jsonb_array_length(p.variants) > 0 and not exists(
        select 1 from jsonb_array_elements(p.variants) v where v->>'name' = variant))
       or (jsonb_array_length(p.variants) = 0 and variant <> '') then
      raise exception 'Varian produk tidak valid';
    end if;
    if p.stock is not null and p.stock < q then raise exception 'Stok produk % tidak cukup', p.title; end if;
    sub = sub + p.price * q;
    if sub > 1000000000 then raise exception 'Total pesanan melewati batas'; end if;
    snapshots = snapshots || jsonb_build_array(jsonb_build_object(
      'product_id', p.id, 'title', p.title, 'category', p.category, 'variant', variant,
      'image', p.image_url, 'quantity', q, 'unit_price', p.price,
      'subtotal', p.price * q, 'stock_tracked', p.stock is not null
    ));
    if p.stock is not null then update public.products set stock = stock - q where id = p.id; end if;
  end loop;
  fee = case when s.free_shipping_min is not null and sub >= s.free_shipping_min then 0 else s.shipping_fee end;
  if sub + fee > 1000000000 then raise exception 'Total pesanan melewati batas'; end if;
  insert into public.orders(
    id, order_number, request_id, receipt_hash, request_hash, customer_name,
    customer_address, customer_phone, customer_note, items, subtotal, shipping_fee,
    total_price, payment_method_id, payment_method, payment_snapshot
  ) values (
    oid, 'ZYHA-' || upper(replace(oid::text, '-', '')), p_request_id,
    encode(extensions.digest(p_receipt_token, 'sha256'), 'hex'), p_request_hash,
    cname, addr, phone, note, snapshots, sub, fee, sub + fee, m.id, m.name, to_jsonb(m)
  );
  insert into public.order_events(order_id, event, new_status, note)
    values (oid, 'order_created', 'pending', 'Pesanan dibuat; harga dan stok divalidasi database.');
  return oid;
end $$;

create or replace function public.zyha_admin_order_action(
  p_id uuid, p_version bigint, p_action text, p_note text,
  p_tracking text default '', p_carrier text default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.orders;
  next_status text;
  next_fulfillment text;
begin
  if not public.zyha_is_admin() then raise exception 'Akses Admin diperlukan'; end if;
  if p_note is null or length(btrim(p_note)) not between 3 and 2000 then
    raise exception 'Isi alasan minimal 3 karakter';
  end if;
  select * into r from public.orders where id = p_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if p_version is null or r.version <> p_version then
    raise exception 'Pesanan telah diperbarui. Muat ulang sebelum mengubah.';
  end if;
  next_status = r.status;
  next_fulfillment = r.fulfillment_status;
  if p_action in ('paid', 'cancelled') then
    if r.status <> 'pending' then
      raise exception 'Hanya pembayaran tertunda yang dapat diverifikasi/dibatalkan';
    end if;
    next_status = p_action;
    if p_action = 'cancelled' then perform public.zyha_restore_stock(r.id); end if;
  elsif p_action in ('processing', 'shipped', 'completed') then
    if r.status not in ('paid', 'partial_refund') then raise exception 'Pesanan harus lunas sebelum diproses'; end if;
    if not ((r.fulfillment_status = 'unfulfilled' and p_action = 'processing')
      or (r.fulfillment_status = 'processing' and p_action = 'shipped')
      or (r.fulfillment_status = 'shipped' and p_action = 'completed')) then
      raise exception 'Urutan status pengiriman tidak valid';
    end if;
    if p_action = 'shipped' and (coalesce(length(btrim(p_tracking)), 0) = 0
      or coalesce(length(btrim(p_carrier)), 0) = 0) then raise exception 'Isi kurir dan nomor resi'; end if;
    next_fulfillment = p_action;
  else
    raise exception 'Tindakan tidak valid';
  end if;
  update public.orders set
    status = next_status,
    fulfillment_status = next_fulfillment,
    tracking_number = case when p_action = 'shipped' then btrim(p_tracking) else tracking_number end,
    carrier = case when p_action = 'shipped' then btrim(p_carrier) else carrier end,
    version = version + 1,
    updated_at = clock_timestamp()
  where id = r.id;
  insert into public.order_events(order_id, actor_id, event, old_status, new_status, note)
    values (r.id, auth.uid(), 'admin_' || p_action, r.status, next_status, btrim(p_note));
  return jsonb_build_object('ok', true);
end $$;

alter table public.orders drop constraint if exists orders_total_price_check;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'zyha_orders_total_range'
  ) then
    alter table public.orders add constraint zyha_orders_total_range
      check (total_price between 1 and 1000000000);
  end if;
end $$;

drop policy if exists zyha_methods_public on public.payment_methods;

alter table public.settings
  drop column if exists midtrans_enabled,
  drop column if exists midtrans_client_key,
  drop column if exists midtrans_mode;

alter table public.orders
  drop column if exists gateway_order_id,
  drop column if exists gateway_transaction_id,
  drop column if exists gateway_state,
  drop column if exists snap_token,
  drop column if exists snap_redirect_url,
  drop column if exists payment_lock_id,
  drop column if exists payment_lock_until,
  drop column if exists gateway_checked_at,
  drop column if exists inventory_note;

update public.orders
set payment_snapshot = payment_snapshot - 'gateway_mode' - 'gateway_client_key';

update public.payment_methods
set is_active = false
where type = 'Midtrans';

alter table public.payment_methods
  drop constraint if exists payment_methods_type_check,
  drop constraint if exists zyha_payment_details;

alter table public.payment_methods
  add constraint zyha_payment_details check (
    (type in ('Bank', 'E-Wallet') and length(btrim(account_number)) > 0 and length(btrim(account_holder)) > 0)
    or (type = 'QRIS' and qris_url <> '')
    or (type = 'Midtrans' and not is_active)
  );

create policy zyha_methods_public on public.payment_methods
  for select to anon, authenticated using (is_active);

notify pgrst, 'reload schema';
commit;
