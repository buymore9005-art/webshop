-- Run in Supabase SQL Editor as postgres after 20261015000000_biteship.sql.
-- Updates only the role guard; preserves the installed function bodies and data.
begin;

do $$
declare
  signature text;
  function_oid regprocedure;
  definition text;
  old_guard constant text := 'coalesce(current_setting(''request.jwt.claim.role'',true),'''')';
  new_guard constant text := 'coalesce(auth.role(),'''')';
begin
  foreach signature in array array[
    'public.zyha_create_biteship_quote(uuid,jsonb,jsonb,integer,jsonb,jsonb,timestamp with time zone)',
    'public.zyha_begin_biteship_shipment(uuid)',
    'public.zyha_complete_biteship_shipment(uuid,text,text,text,text)',
    'public.zyha_fail_biteship_shipment(uuid,text)'
  ] loop
    function_oid := to_regprocedure(signature);
    if function_oid is null then
      raise exception 'Required function missing: %. Apply the Biteship foundation migration first.', signature;
    end if;
    definition := pg_get_functiondef(function_oid);
    if position(old_guard in definition) > 0 then
      execute replace(definition, old_guard, new_guard);
    elsif position(new_guard in definition) = 0 then
      raise exception 'Unexpected role guard in %. Review before applying this migration.', signature;
    end if;

    execute format('revoke all on function %s from public, anon, authenticated', function_oid);
    execute format('grant execute on function %s to service_role', function_oid);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;