begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.coupon_redemptions
  add column if not exists customer_user_id uuid
  references auth.users(id) on delete set null;

-- Historical account orders can retain their usage limits; guest redemptions
-- cannot be assigned to an account because the submitted phone was unverified.
update public.coupon_redemptions redemption
set customer_user_id = orders.customer_user_id
from public.orders orders
where redemption.order_id = orders.id
  and redemption.customer_user_id is null
  and orders.customer_user_id is not null;

create index if not exists zyha_coupon_redemptions_user_idx
  on public.coupon_redemptions(coupon_id, customer_user_id)
  where customer_user_id is not null;

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
  v_customer_user_id uuid;
begin
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    if p_customer_key is null
       or p_customer_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Login pelanggan diperlukan untuk menggunakan kupon';
    end if;
    v_customer_user_id := p_customer_key::uuid;
    if not exists (
      select 1 from auth.users
      where id = v_customer_user_id and not coalesce(is_anonymous, false)
    ) then
      raise exception 'Akun pelanggan tidak valid untuk menggunakan kupon';
    end if;
  end if;

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
      where coupon_id = c.id and coupon_redemptions.customer_user_id = v_customer_user_id;
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
  insert into public.coupon_redemptions(coupon_id, order_id, customer_key, customer_user_id)
    values (
      c.id, oid,
      encode(extensions.digest(v_customer_user_id::text, 'sha256'), 'hex'),
      v_customer_user_id
    );
  update public.coupons set times_used = times_used + 1 where id = c.id;
  return oid;
end
$$;
revoke all on function public.zyha_place_order_with_coupon(uuid, text, text, jsonb, jsonb, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.zyha_place_order_with_coupon(uuid, text, text, jsonb, jsonb, uuid, text, text)
  to service_role;

create or replace function public.zyha_account_checkout(
  p_user_id uuid, p_biteship boolean, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rid uuid := (p_payload->>'p_request_id')::uuid;
  oid uuid;
  owner_id uuid;
  checkout_payload jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users where id = p_user_id and not coalesce(is_anonymous, false)
  ) then raise exception 'Login pelanggan diperlukan'; end if;
  perform pg_advisory_xact_lock(hashtextextended(rid::text, 0));
  select customer_user_id into owner_id from public.orders where request_id = rid;
  if found and owner_id is distinct from p_user_id then
    raise exception 'Pesanan bukan milik akun ini';
  end if;

  -- Never accept coupon identity from the request body; bind it to the user
  -- already verified by rapid-api against Supabase Auth.
  checkout_payload := jsonb_set(p_payload, '{p_customer_key}', to_jsonb(p_user_id::text), true);
  if p_biteship then
    oid := public.zyha_place_order_with_biteship(
      rid, checkout_payload->>'p_receipt_token', checkout_payload->>'p_request_hash',
      checkout_payload->'p_items', checkout_payload->'p_customer',
      (checkout_payload->>'p_method_id')::uuid,
      checkout_payload->>'p_coupon_code', checkout_payload->>'p_customer_key',
      (checkout_payload->>'p_quote_id')::uuid, checkout_payload->>'p_service_key');
  else
    oid := public.zyha_place_order_with_coupon(
      rid, checkout_payload->>'p_receipt_token', checkout_payload->>'p_request_hash',
      checkout_payload->'p_items', checkout_payload->'p_customer',
      (checkout_payload->>'p_method_id')::uuid,
      checkout_payload->>'p_coupon_code', checkout_payload->>'p_customer_key');
  end if;
  update public.orders set customer_user_id = p_user_id where id = oid;
  return oid;
end
$$;
revoke all on function public.zyha_account_checkout(uuid, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.zyha_account_checkout(uuid, boolean, jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
