-- STAGING ONLY. Run after supabase-setup.sql as the SQL Editor postgres role.
-- All fixture products/methods/orders/settings are rolled back, including on error
-- if you issue ROLLBACK after a failed assertion. Never run against a busy store.
-- This file is a test, NOT a second setup migration. No live run was performed
-- in the source-delivery environment. No auth.users rows are created or changed.
begin;
set local statement_timeout='30s';
do $$
declare p uuid; m uuid; o uuid; again uuid; rid uuid=gen_random_uuid(); stock_now integer; total_now bigint;
 token text=repeat('a',64); reqhash text=repeat('b',64); customer jsonb='{"name":"QA staging","address":"Alamat pengujian database staging saja","phone":"6281234567890","note":""}'::jsonb;
begin
 if has_table_privilege('anon','public.orders','SELECT') or has_table_privilege('anon','public.orders','INSERT') or has_table_privilege('authenticated','public.orders','UPDATE') then raise exception 'FAIL: browser has private order read/write privilege'; end if;
 if has_function_privilege('anon','public.zyha_place_order(uuid,text,text,jsonb,jsonb,uuid)','EXECUTE') or has_function_privilege('authenticated','public.zyha_place_order(uuid,text,text,jsonb,jsonb,uuid)','EXECUTE') then raise exception 'FAIL: service checkout RPC exposed to browser'; end if;
 if not has_function_privilege('service_role','public.zyha_place_order(uuid,text,text,jsonb,jsonb,uuid)','EXECUTE') then raise exception 'FAIL: service checkout RPC unavailable'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('orders','products','settings','payment_methods','order_events','admin_users') and not c.relrowsecurity) then raise exception 'FAIL: RLS missing'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='settings' and column_name='midtrans_server_key') then raise exception 'FAIL: server key column in public settings'; end if;
 update public.settings set shipping_fee=10000,free_shipping_min=null where id=1;
 insert into public.products(title,price,stock,variants) values('QA rollback product',125000,5,'[{"name":" KHAKI ","image":""}]') returning id into p;
 if (select variants->0->>'name' from public.products where id=p)<>'KHAKI' then raise exception 'FAIL: variant not normalized'; end if;
 insert into public.payment_methods(name,type,account_number,account_holder) values('QA rollback bank','Bank','00000000','QA STAGING') returning id into m;
 o=public.zyha_place_order(rid,token,reqhash,jsonb_build_array(jsonb_build_object('product_id',p,'variant','KHAKI','quantity',2,'price',1)),customer,m);
 select total_price into total_now from public.orders where id=o;
 select stock into stock_now from public.products where id=p;
 if total_now<>260000 or stock_now<>3 then raise exception 'FAIL: trusted pricing or reservation'; end if;
 again=public.zyha_place_order(rid,token,reqhash,jsonb_build_array(jsonb_build_object('product_id',p,'variant','KHAKI','quantity',2)),customer,m);
 if again<>o or (select stock from public.products where id=p)<>3 then raise exception 'FAIL: idempotent retry duplicated order/reservation'; end if;
 begin
  perform public.zyha_place_order(rid,repeat('c',64),reqhash,'[]',customer,m);
  raise exception using errcode='ZQ001',message='FAIL: wrong receipt token accepted';
 exception when sqlstate 'P0001' then null; end;
 begin
  perform public.zyha_place_order(gen_random_uuid(),token,reqhash,jsonb_build_array(jsonb_build_object('product_id',p,'variant','KHAKI','quantity',4)),customer,m);
  raise exception using errcode='ZQ002',message='FAIL: overselling accepted';
 exception when sqlstate 'P0001' then null; end;
 if (select stock from public.products where id=p)<>3 then raise exception 'FAIL: failed order changed stock'; end if;
 if (public.zyha_receipt(rid,token)->>'total_price')::bigint<>260000 then raise exception 'FAIL: receipt mismatch'; end if;
 if public.zyha_receipt(rid,token) ? 'customer_address' then raise exception 'FAIL: receipt unnecessarily exposes shipping address'; end if;
 perform public.zyha_restore_stock(o);perform public.zyha_restore_stock(o);
 if (select stock from public.products where id=p)<>5 then raise exception 'FAIL: stock returned more than once'; end if;
 raise notice 'PASS: grants, RLS flags, pricing, idempotency, variant, stock, receipt';
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.orders limit 1;raise exception using errcode='ZQ003',message='FAIL: anonymous order read succeeded';exception when insufficient_privilege then null;end;
 begin perform public.zyha_place_order(null,null,null,null,null,null);raise exception using errcode='ZQ004',message='FAIL: anonymous checkout RPC allowed';exception when insufficient_privilege then null;end;
 raise notice 'PASS: anonymous direct order and service RPC access denied';
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
do $$ begin
 if public.zyha_is_admin() then raise exception 'Fixture UUID unexpectedly belongs to an active Admin; choose another UUID';end if;
 if exists(select 1 from public.orders) then raise exception 'FAIL: non-Admin sees private orders';end if;
 begin perform public.zyha_dashboard(null,null);raise exception using errcode='ZQ005',message='FAIL: non-Admin dashboard allowed';exception when sqlstate 'P0001' then null;end;
 raise notice 'PASS: authenticated non-Admin access denied';
end $$;
reset role;
rollback;
