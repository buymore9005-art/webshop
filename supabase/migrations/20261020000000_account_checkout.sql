-- Apply after all previous migrations, before deploying rapid-api and the UI.
begin;

-- Invoker rights retain orders RLS; explicit ownership also excludes other
-- customers when the caller is an admin. No receipt secret or expiry is used.
create or replace function public.zyha_customer_receipt(p_order_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'items', o.items,
    'subtotal', o.subtotal, 'shipping_fee', o.shipping_fee,
    'coupon_code', o.coupon_code, 'discount_amount', o.discount_amount,
    'total_price', o.total_price, 'status', o.status,
    'payment_method', o.payment_method, 'payment_snapshot', o.payment_snapshot,
    'fulfillment_status', o.fulfillment_status, 'tracking_number', o.tracking_number,
    'carrier', o.carrier, 'shipping_courier_name', o.shipping_courier_name,
    'shipping_service_name', o.shipping_service_name, 'created_at', o.created_at,
    'customer', jsonb_build_object('name', o.customer_name, 'phone', o.customer_phone,
      'address', o.customer_address, 'district', o.customer_district,
      'city', o.customer_city, 'province', o.customer_province,
      'postal_code', o.customer_postal_code, 'note', o.customer_note)
  ) from public.orders o
  where o.id = p_order_id and o.customer_user_id = (select auth.uid())
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false);
$$;
revoke all on function public.zyha_customer_receipt(uuid) from public, anon;
grant execute on function public.zyha_customer_receipt(uuid) to authenticated;

-- Service-only transaction: inventory, coupon, shipping and ownership either
-- commit together or roll back together. Serializes retries before checking owner.
create or replace function public.zyha_account_checkout(p_user_id uuid, p_biteship boolean, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rid uuid := (p_payload->>'p_request_id')::uuid;
  oid uuid;
  owner_id uuid;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users where id = p_user_id and not coalesce(is_anonymous, false)
  ) then raise exception 'Login pelanggan diperlukan'; end if;
  perform pg_advisory_xact_lock(hashtextextended(rid::text, 0));
  select customer_user_id into owner_id from public.orders where request_id = rid;
  if found and owner_id is distinct from p_user_id then
    raise exception 'Pesanan bukan milik akun ini';
  end if;
  if p_biteship then
    oid := public.zyha_place_order_with_biteship(
      rid, p_payload->>'p_receipt_token', p_payload->>'p_request_hash', p_payload->'p_items',
      p_payload->'p_customer', (p_payload->>'p_method_id')::uuid,
      p_payload->>'p_coupon_code', p_payload->>'p_customer_key',
      (p_payload->>'p_quote_id')::uuid, p_payload->>'p_service_key');
  else
    oid := public.zyha_place_order_with_coupon(
      rid, p_payload->>'p_receipt_token', p_payload->>'p_request_hash', p_payload->'p_items',
      p_payload->'p_customer', (p_payload->>'p_method_id')::uuid,
      p_payload->>'p_coupon_code', p_payload->>'p_customer_key');
  end if;
  update public.orders set customer_user_id = p_user_id where id = oid;
  return oid;
end $$;
revoke all on function public.zyha_account_checkout(uuid, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.zyha_account_checkout(uuid, boolean, jsonb) to service_role;
commit;