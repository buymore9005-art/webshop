-- Additive sync state. No payment, inventory, or fulfillment mutations.
begin;
set local lock_timeout='10s';
set local statement_timeout='90s';
alter table public.orders
 add column if not exists provider_status text not null default '',
 add column if not exists provider_status_at timestamptz,
 add column if not exists shipping_synced_at timestamptz,
 add column if not exists shipping_status_history jsonb not null default '[]';
create table if not exists zyha_private.shipment_sync (
 order_id uuid primary key references public.orders(id),
 revision bigint not null default 0,
 lease_until timestamptz,
 next_attempt timestamptz not null default now(),
 failures integer not null default 0,
 fingerprint text not null default ''
);
create table if not exists zyha_private.shipment_sync_history (
 order_id uuid not null references public.orders(id),
 fingerprint text not null,
 status text not null,
 provider_at timestamptz,
 observed_at timestamptz not null default now(),
 primary key(order_id,fingerprint)
);
alter table zyha_private.shipment_sync enable row level security;
alter table zyha_private.shipment_sync_history enable row level security;
revoke all on zyha_private.shipment_sync,zyha_private.shipment_sync_history from public,anon,authenticated;

-- Claim BEFORE the network request. Expiring leases use fencing revisions so a
-- slow, superseded request cannot overwrite a newer canonical observation.
create or replace function public.zyha_claim_shipment_sync(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.shipping_shipments; c zyha_private.shipment_sync;
begin
 select * into s from public.shipping_shipments where order_id=p_order_id and provider_code='biteship' and provider_shipment_id<>'';
 if not found then return null; end if;
 insert into zyha_private.shipment_sync(order_id) values(p_order_id) on conflict do nothing;
 select * into c from zyha_private.shipment_sync where order_id=p_order_id for update;
 if c.lease_until>now() or c.next_attempt>now() then return null; end if;
 update zyha_private.shipment_sync set revision=revision+1,lease_until=now()+interval '60 seconds',next_attempt=now()+interval '60 seconds'
 where order_id=p_order_id returning * into c;
 return jsonb_build_object('provider_id',s.provider_shipment_id,'revision',c.revision);
end $$;

create or replace function public.zyha_finish_shipment_sync(p_order_id uuid,p_revision bigint,p_snapshot jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare c zyha_private.shipment_sync; o public.orders; st text; wb text; stamp timestamptz; fp text;
begin
 select * into c from zyha_private.shipment_sync where order_id=p_order_id for update;
 if not found or c.revision<>p_revision or c.lease_until is null or c.lease_until<now() then return false; end if;
 if p_snapshot is null then
  update zyha_private.shipment_sync set lease_until=null,failures=least(failures+1,8),next_attempt=now()+make_interval(secs=>least(3600,60*power(2,least(failures+1,6)))::integer) where order_id=p_order_id;
  return false;
 end if;
 st=p_snapshot->>'status'; wb=p_snapshot->>'waybill'; stamp=(p_snapshot->>'timestamp')::timestamptz;
 if st is null or st !~ '^[a-z_]{1,60}$' or length(coalesce(wb,''))>120 then raise exception 'Invalid canonical shipment'; end if;
 select * into o from public.orders where id=p_order_id for update;
 -- Provider history timestamps are optional; never invent one from a webhook.
 if stamp is not null and o.provider_status_at is not null and stamp<o.provider_status_at then
  update zyha_private.shipment_sync set lease_until=null,next_attempt=now()+interval '5 minutes' where order_id=p_order_id;
  return false;
 end if;
 fp=md5(jsonb_build_array(st,wb,stamp)::text);
 insert into zyha_private.shipment_sync_history(order_id,fingerprint,status,provider_at) values(p_order_id,fp,st,stamp) on conflict do nothing;
 update public.orders set provider_status=st,provider_status_at=coalesce(stamp,provider_status_at),shipping_synced_at=now(),
 tracking_number=coalesce(nullif(wb,''),tracking_number),
 shipping_status_history=(select coalesce(jsonb_agg(to_jsonb(h) order by h.observed_at desc),'[]'::jsonb) from (select status,provider_at,observed_at from zyha_private.shipment_sync_history where order_id=p_order_id order by observed_at desc limit 50) h)
 where id=p_order_id;
 update public.shipping_shipments set tracking_number=coalesce(nullif(wb,''),tracking_number) where order_id=p_order_id;
 update zyha_private.shipment_sync set fingerprint=fp,failures=0,lease_until=null,
 next_attempt=now()+case when st in ('delivered','returned','cancelled','rejected','disposed') then interval '6 hours' else interval '5 minutes' end where order_id=p_order_id;
 return true;
end $$;

create or replace function public.zyha_shipment_sync_batch()
returns table(order_id uuid) language sql security definer set search_path='' as $$
 select s.order_id from public.shipping_shipments s
 join public.orders o on o.id=s.order_id
 left join zyha_private.shipment_sync c on c.order_id=s.order_id
 where s.provider_code='biteship' and s.provider_shipment_id<>''
 and (c.next_attempt is null or c.next_attempt<=now()) and (c.lease_until is null or c.lease_until<=now())
 and (o.provider_status not in ('delivered','returned','cancelled','rejected','disposed') or coalesce(o.provider_status_at,s.created_at)>now()-interval '30 days')
 order by c.next_attempt nulls first,s.created_at limit 20
$$;
revoke all on function public.zyha_claim_shipment_sync(uuid),public.zyha_finish_shipment_sync(uuid,bigint,jsonb),public.zyha_shipment_sync_batch() from public,anon,authenticated;
grant execute on function public.zyha_claim_shipment_sync(uuid),public.zyha_finish_shipment_sync(uuid,bigint,jsonb),public.zyha_shipment_sync_batch() to service_role;
-- Existing owner-only orders policies remain unchanged; no customer shipment access.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
  alter publication supabase_realtime add table public.orders;
 end if;
end $$;
commit;