begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.products
  add column if not exists stock_alert_threshold integer not null default 5;

alter table public.products
  drop constraint if exists zyha_products_stock_alert_threshold;
alter table public.products
  add constraint zyha_products_stock_alert_threshold
  check (stock_alert_threshold between 0 and 100000000);

create or replace function public.zyha_product_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v jsonb;
  img text;
  stock_value jsonb;
  threshold_value jsonb;
begin
  new.title = btrim(new.title);
  new.category = btrim(new.category);
  if tg_op = 'UPDATE' then
    new.version = old.version + 1;
    new.created_at = old.created_at;
  else
    new.version = 1;
  end if;
  new.updated_at = clock_timestamp();

  foreach img in array new.images loop
    if img is null or img !~ '^https://' or length(img) > 2048 then
      raise exception 'URL gambar tidak valid';
    end if;
  end loop;

  if jsonb_typeof(new.variants) <> 'array' then
    raise exception 'Variasi harus berupa array';
  end if;
  for v in select value from jsonb_array_elements(new.variants) loop
    if jsonb_typeof(v) <> 'object'
       or jsonb_typeof(v->'name') is distinct from 'string'
       or coalesce(length(btrim(v->>'name')), 0) not between 1 and 100
       or (coalesce(v->>'image', '') <> ''
           and ((v->>'image') !~ '^https://' or length(v->>'image') > 2048)) then
      raise exception 'Varian tidak valid';
    end if;

    stock_value = case when not (v ? 'stock') then '0'::jsonb else v->'stock' end;
    threshold_value = case when not (v ? 'low_stock_threshold') then '5'::jsonb else v->'low_stock_threshold' end;
    if jsonb_typeof(stock_value) not in ('number', 'null')
       or (jsonb_typeof(stock_value) = 'number'
           and ((stock_value #>> '{}') !~ '^(0|[1-9][0-9]*)$'
                or (stock_value #>> '{}')::numeric > 100000000)) then
      raise exception 'Stok varian harus bilangan bulat 0–100.000.000 atau null';
    end if;
    if jsonb_typeof(threshold_value) <> 'number'
       or (threshold_value #>> '{}') !~ '^(0|[1-9][0-9]*)$'
       or (threshold_value #>> '{}')::numeric > 100000000 then
      raise exception 'Batas peringatan stok varian tidak valid';
    end if;
  end loop;

  new.variants = coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', btrim(value->>'name'),
      'image', btrim(coalesce(value->>'image', '')),
      'stock', case when not (value ? 'stock') then '0'::jsonb else value->'stock' end,
      'low_stock_threshold', case when not (value ? 'low_stock_threshold') then '5'::jsonb else value->'low_stock_threshold' end
    ) order by ordinal)
    from jsonb_array_elements(new.variants) with ordinality as v(value, ordinal)
  ), '[]'::jsonb);

  if (select count(*) from jsonb_array_elements(new.variants))
     <> (select count(distinct btrim(value->>'name')) from jsonb_array_elements(new.variants)) then
    raise exception 'Nama varian tidak boleh duplikat';
  end if;
  return new;
end
$$;

drop trigger if exists zyha_product_guard on public.products;
create trigger zyha_product_guard
  before insert or update on public.products
  for each row execute function public.zyha_product_guard();

-- Existing shared product stock is not copied to each variant: that would multiply
-- the sellable quantity. Variant stock starts at zero for explicit Admin allocation.
update public.products
set variants = (
      select jsonb_agg(jsonb_build_object(
        'name', value->>'name',
        'image', coalesce(value->>'image', ''),
        'stock', 0,
        'low_stock_threshold', 5
      ) order by ordinal)
      from jsonb_array_elements(variants) with ordinality as v(value, ordinal)
    ),
    stock = null
where jsonb_array_length(variants) > 0
  and exists (
    select 1 from jsonb_array_elements(variants) value
    where not (value ? 'stock')
  );

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  variant_name text,
  delta integer not null check (delta <> 0 and delta between -100000000 and 100000000),
  stock_after integer not null check (stock_after between 0 and 100000000),
  reason text not null check (length(btrim(reason)) between 3 and 200),
  actor_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.orders(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists zyha_inventory_movements_history
  on public.inventory_movements(product_id, variant_name, created_at desc);
alter table public.inventory_movements enable row level security;
drop policy if exists zyha_inventory_movements_admin_read on public.inventory_movements;
create policy zyha_inventory_movements_admin_read
  on public.inventory_movements for select to authenticated
  using ((select public.zyha_is_admin()));
revoke all on public.inventory_movements from public, anon, authenticated;
grant select on public.inventory_movements to authenticated;
grant all on public.inventory_movements to service_role;

create or replace function public.zyha_admin_adjust_inventory(
  p_product_id uuid,
  p_variant text,
  p_delta integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.products;
  variant_value jsonb;
  current_stock integer;
  next_stock integer;
  movement_id uuid;
  selected_variant text = coalesce(p_variant, '');
begin
  if not public.zyha_is_admin() then
    raise exception 'Akses Admin diperlukan';
  end if;
  if p_product_id is null or p_delta is null or p_delta = 0
     or abs(p_delta::bigint) > 100000000
     or p_reason is null or length(btrim(p_reason)) not between 3 and 200 then
    raise exception 'Data penyesuaian stok tidak valid';
  end if;

  select * into p from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Produk tidak ditemukan';
  end if;

  if jsonb_array_length(p.variants) > 0 then
    select value into variant_value
    from jsonb_array_elements(p.variants)
    where value->>'name' = selected_variant;
    if not found then
      raise exception 'Varian produk tidak ditemukan';
    end if;
    if jsonb_typeof(variant_value->'stock') = 'null' then
      raise exception 'Stok varian tidak dibatasi. Atur batas stok dari detail produk terlebih dahulu.';
    end if;
    current_stock = (variant_value->>'stock')::integer;
  else
    if selected_variant <> '' then
      raise exception 'Produk ini tidak memiliki varian';
    end if;
    if p.stock is null then
      raise exception 'Stok produk tidak dibatasi. Atur batas stok dari detail produk terlebih dahulu.';
    end if;
    current_stock = p.stock;
  end if;

  next_stock = current_stock + p_delta;
  if next_stock < 0 or next_stock > 100000000 then
    raise exception 'Penyesuaian menghasilkan stok di luar batas yang diizinkan';
  end if;

  if jsonb_array_length(p.variants) > 0 then
    update public.products
    set variants = (
      select jsonb_agg(
        case when value->>'name' = selected_variant
          then jsonb_set(value, '{stock}', to_jsonb(next_stock), true)
          else value
        end order by ordinal
      )
      from jsonb_array_elements(p.variants) with ordinality as v(value, ordinal)
    )
    where id = p.id;
  else
    update public.products set stock = next_stock where id = p.id;
  end if;

  insert into public.inventory_movements(
    product_id, variant_name, delta, stock_after, reason, actor_id
  ) values (
    p.id, nullif(selected_variant, ''), p_delta, next_stock, btrim(p_reason), auth.uid()
  ) returning id into movement_id;

  return jsonb_build_object('stock', next_stock, 'movement_id', movement_id);
end
$$;
revoke all on function public.zyha_admin_adjust_inventory(uuid, text, integer, text)
  from public, anon;
grant execute on function public.zyha_admin_adjust_inventory(uuid, text, integer, text)
  to authenticated;

create or replace function public.zyha_restore_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.orders;
  item_record record;
  item_product public.products;
  restored_stock integer;
begin
  select * into r from public.orders where id = p_order_id for update;
  if not found or r.stock_restored then
    return;
  end if;

  perform 1 from public.products
  where id in (
    select (value->>'product_id')::uuid from jsonb_array_elements(r.items)
  )
  order by id for update;

  for item_record in
    select (value->>'product_id')::uuid as product_id,
      coalesce(value->>'variant', '') as variant_name,
      sum((value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(r.items) as item(value)
    where coalesce((value->>'stock_tracked')::boolean, false)
    group by (value->>'product_id')::uuid, coalesce(value->>'variant', '')
  loop
    restored_stock = item_record.quantity;
    select * into item_product from public.products where id = item_record.product_id;
    if not found then
      raise exception 'Produk pesanan % tidak ditemukan; stok tidak dapat dikembalikan', item_record.product_id;
    end if;

    if jsonb_array_length(item_product.variants) > 0 and item_record.variant_name <> '' then
      if not exists (
        select 1 from jsonb_array_elements(item_product.variants) value
        where value->>'name' = item_record.variant_name
      ) then
        raise exception 'Varian % produk % tidak ditemukan; kembalikan varian sebelum membatalkan pesanan',
          item_record.variant_name, item_product.title;
      end if;
      update public.products
      set variants = (
        select jsonb_agg(
          case when value->>'name' = item_record.variant_name
                  and jsonb_typeof(value->'stock') = 'number'
            then jsonb_set(value, '{stock}', to_jsonb((value->>'stock')::integer + restored_stock), true)
            else value
          end order by ordinal
        )
        from jsonb_array_elements(item_product.variants) with ordinality as v(value, ordinal)
      )
      where id = item_product.id
        and exists (
          select 1 from jsonb_array_elements(item_product.variants) value
          where value->>'name' = item_record.variant_name
            and jsonb_typeof(value->'stock') = 'number'
        );
      if found then
        insert into public.inventory_movements(
          product_id, variant_name, delta, stock_after, reason, order_id
        )
        select item_product.id, item_record.variant_name, restored_stock,
          (value->>'stock')::integer + restored_stock,
          'Pengembalian stok pesanan ' || r.order_number, r.id
        from jsonb_array_elements(item_product.variants) value
        where value->>'name' = item_record.variant_name
          and jsonb_typeof(value->'stock') = 'number';
      end if;
    elsif jsonb_array_length(item_product.variants) = 0 and item_record.variant_name = '' then
      update public.products set stock = stock + restored_stock
      where id = item_product.id and stock is not null;
      if found then
        insert into public.inventory_movements(
          product_id, variant_name, delta, stock_after, reason, order_id
        ) values (
          item_product.id, null, restored_stock, item_product.stock + restored_stock,
          'Pengembalian stok pesanan ' || r.order_number, r.id
        );
      end if;
    else
      raise exception 'Struktur stok produk % berubah; pulihkan produk/varian sebelum membatalkan pesanan',
        item_product.title;
    end if;
  end loop;
  update public.orders set stock_restored = true where id = r.id;
end
$$;

create or replace function public.zyha_place_order(
  p_request_id uuid, p_receipt_token text, p_request_hash text, p_items jsonb,
  p_customer jsonb, p_method_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_order public.orders;
  s public.settings;
  m public.payment_methods;
  p public.products;
  line jsonb;
  variant_value jsonb;
  snapshots jsonb = '[]';
  q integer;
  variant text;
  pid uuid;
  oid uuid = gen_random_uuid();
  sub bigint = 0;
  fee bigint;
  total_weight bigint = 0;
  cname text;
  addr text;
  district text;
  city text;
  province text;
  postal_code text;
  phone text;
  note text;
  current_stock integer;
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
  district = btrim(p_customer->>'district');
  city = btrim(p_customer->>'city');
  province = btrim(p_customer->>'province');
  postal_code = btrim(p_customer->>'postal_code');
  phone = p_customer->>'phone';
  note = btrim(coalesce(p_customer->>'note', ''));
  if cname is null or length(cname) not between 2 and 120
     or addr is null or length(addr) not between 10 and 500
     or district is null or length(district) not between 2 and 100
     or city is null or length(city) not between 2 and 100
     or province is null or length(province) not between 2 and 100
     or postal_code is null or postal_code !~ '^[0-9]{5}$'
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
  if not found then
    raise exception 'Metode pembayaran tidak tersedia';
  end if;
  perform 1 from public.products
  where id in (select (value->>'product_id')::uuid from jsonb_array_elements(p_items))
  order by id for update;

  for line in select value from jsonb_array_elements(p_items) loop
    if coalesce(line->>'quantity', '') !~ '^[1-9][0-9]?$' then
      raise exception 'Jumlah harus 1–99';
    end if;
    q = (line->>'quantity')::integer;
    pid = (line->>'product_id')::uuid;
    variant = coalesce(line->>'variant', '');
    select * into p from public.products where id = pid and is_active;
    if not found then
      raise exception 'Produk tidak tersedia';
    end if;
    if jsonb_array_length(p.variants) > 0 then
      select value into variant_value
      from jsonb_array_elements(p.variants)
      where value->>'name' = variant;
      if not found then
        raise exception 'Varian produk tidak valid';
      end if;
      current_stock = case when jsonb_typeof(variant_value->'stock') = 'number'
        then (variant_value->>'stock')::integer else null end;
    elsif variant <> '' then
      raise exception 'Varian produk tidak valid';
    else
      current_stock = p.stock;
    end if;
    if current_stock is not null and current_stock < q then
      raise exception 'Stok varian/produk % tidak cukup', coalesce(variant, p.title);
    end if;
    sub = sub + p.price * q;
    if sub > 1000000000 then
      raise exception 'Total pesanan melewati batas';
    end if;
    total_weight = total_weight + p.weight_grams::bigint * q;
    if total_weight > 100000000000 then
      raise exception 'Berat pesanan melewati batas';
    end if;

    snapshots = snapshots || jsonb_build_array(jsonb_build_object(
      'product_id', p.id,
      'title', p.title,
      'category', p.category,
      'variant', variant,
      'image', coalesce(variant_value->>'image', p.image_url),
      'quantity', q,
      'unit_price', p.price,
      'subtotal', p.price * q,
      'stock_tracked', current_stock is not null,
      'weight_grams', p.weight_grams
    ));

    if jsonb_array_length(p.variants) > 0 and current_stock is not null then
      update public.products
      set variants = (
        select jsonb_agg(
          case when value->>'name' = variant
            then jsonb_set(value, '{stock}', to_jsonb(current_stock - q), true)
            else value
          end order by ordinal
        )
        from jsonb_array_elements(p.variants) with ordinality as v(value, ordinal)
      )
      where id = p.id;
      insert into public.inventory_movements(product_id, variant_name, delta, stock_after, reason)
        values (p.id, variant, -q, current_stock - q, 'Penjualan checkout');
    elsif jsonb_array_length(p.variants) = 0 and current_stock is not null then
      update public.products set stock = stock - q where id = p.id;
      insert into public.inventory_movements(product_id, delta, stock_after, reason)
        values (p.id, -q, current_stock - q, 'Penjualan checkout');
    end if;
  end loop;

  fee = case when s.free_shipping_min is not null and sub >= s.free_shipping_min
    then 0 else s.shipping_fee end;
  if sub + fee > 1000000000 then
    raise exception 'Total pesanan melewati batas';
  end if;
  insert into public.orders(
    id, order_number, request_id, receipt_hash, request_hash, customer_name,
    customer_address, customer_district, customer_city, customer_province,
    customer_postal_code, customer_phone, customer_note, items, subtotal,
    shipping_fee, total_price, total_weight_grams, payment_method_id,
    payment_method, payment_snapshot
  ) values (
    oid, 'ZYHA-' || upper(replace(oid::text, '-', '')), p_request_id,
    encode(extensions.digest(p_receipt_token, 'sha256'), 'hex'), p_request_hash,
    cname, addr, district, city, province, postal_code, phone, note, snapshots,
    sub, fee, sub + fee, total_weight, m.id, m.name, to_jsonb(m)
  );
  insert into public.order_events(order_id, event, new_status, note)
  values (oid, 'order_created', 'pending', 'Pesanan dibuat; harga dan stok produk/varian divalidasi database.');
  return oid;
end
$$;

revoke all on function public.zyha_product_guard() from public, anon, authenticated;
revoke all on function public.zyha_restore_stock(uuid) from public, anon, authenticated;
revoke all on function public.zyha_place_order(uuid, text, text, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.zyha_place_order(uuid, text, text, jsonb, jsonb, uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
