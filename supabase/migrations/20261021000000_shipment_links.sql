-- Run in Supabase SQL Editor after the Biteship and service-role fix migrations.
-- Existing URLs are preserved verbatim and intentionally remain unverified.
begin;

alter table public.shipping_shipments
  add column if not exists tracking_url text not null default '',
  add column if not exists label_url_verified boolean not null default false;

comment on column public.shipping_shipments.label_url_verified is
  'True only for an explicit provider label field or a manually verified official label. Legacy label_url may be tracking.';
comment on column public.shipping_shipments.tracking_url is
  'Provider tracking page (Biteship courier.link), never an official label fallback.';

-- Separate name: preserve the original five-argument RPC, without overloads.
-- The old RPC retains its locking, state checks, order updates and audit event.
create or replace function public.zyha_complete_biteship_shipment_v2(
  p_order_id uuid,p_provider_shipment_id text,p_tracking_number text,
  p_label_url text,p_tracking_url text,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  link text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Akses server diperlukan';
  end if;
  foreach link in array array[p_label_url,p_tracking_url] loop
    if link is null or length(link)>2048 or (link<>'' and (
      link !~ '^https://[^/?#[:space:]@:]+(:[0-9]+)?([/?#][^[:space:]]*)?$'
      or link ~ '[[:cntrl:]]' or position(chr(92) in link)>0
    )) then
      raise exception 'URL pengiriman tidak valid';
    end if;
  end loop;
  perform public.zyha_complete_biteship_shipment(
    p_order_id,p_provider_shipment_id,p_tracking_number,p_label_url,p_status);
  update public.shipping_shipments
    set tracking_url=p_tracking_url,label_url_verified=(p_label_url<>'')
    where order_id=p_order_id;
end $$;
revoke all on function public.zyha_complete_biteship_shipment_v2(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.zyha_complete_biteship_shipment_v2(uuid,text,text,text,text,text) to service_role;

notify pgrst, 'reload schema';
commit;