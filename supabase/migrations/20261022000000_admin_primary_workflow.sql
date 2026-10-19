-- Only normal payment/processing actions may omit a note. Audit remains mandatory.
begin;
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
  if p_action in ('paid', 'processing') then
    if length(coalesce(btrim(p_note), '')) > 2000 then
      raise exception 'Catatan maksimal 2000 karakter';
    end if;
  elsif p_note is null or length(btrim(p_note)) not between 3 and 2000 then
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
    if p_action = 'shipped' and r.shipping_quote_id is not null then
      raise exception 'Pesanan Biteship harus melalui booking kurir';
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
    values (r.id, auth.uid(), 'admin_' || p_action, r.status, next_status, coalesce(btrim(p_note), ''));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.zyha_admin_order_action(uuid,bigint,text,text,text,text) from public,anon;
grant execute on function public.zyha_admin_order_action(uuid,bigint,text,text,text,text) to authenticated,service_role;
commit;