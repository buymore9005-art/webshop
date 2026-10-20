-- Run after extensions and named Vault entries are configured in Dashboard.
do $$ begin
 if (select count(*) from vault.decrypted_secrets where name in
 ('biteship_sync_url','biteship_sync_secret','biteship_sync_gateway_jwt') and length(decrypted_secret)>0)<>3 then
  raise exception 'Configure the three named Vault secrets before scheduling';
 end if;
end $$;
select cron.schedule('biteship-status-sync','* * * * *',$job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='biteship_sync_url'),
  headers := jsonb_build_object(
   'Content-Type','application/json',
   'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='biteship_sync_gateway_jwt'),
   'x-shipment-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='biteship_sync_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 90000
 ) where exists(select 1 from vault.decrypted_secrets where name='biteship_sync_secret' and length(decrypted_secret)>=32);
$job$);