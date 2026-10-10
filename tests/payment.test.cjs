const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');

test('checkout accepts only manual payment methods on the server',()=>{
  assert.match(read('supabase/functions/rapid-api/index.ts'),/!\['Bank', 'E-Wallet', 'QRIS'\]\.includes\(method\.type\)/);
});
test('fresh database supports only Bank, E-Wallet and QRIS',()=>{
  const sql=read('supabase-setup.sql');
  assert.match(sql,/type in \('Bank','E-Wallet','QRIS'\)/);
  assert.doesNotMatch(sql,/midtrans|gateway_|snap_token/i);
});
test('legacy cleanup preserves orders but drops obsolete payment state',()=>{
  const migration=read('supabase/migrations/20261011000000_remove_midtrans.sql');
  assert.match(migration,/drop column if exists gateway_transaction_id/);
  assert.match(migration,/set payment_snapshot = payment_snapshot - 'gateway_mode'/);
  assert.doesNotMatch(migration,/delete from public\.orders/i);
});
test('coupon checkout function grants use its declared argument types',()=>{
  const migration=read('supabase/migrations/20261010000000_store_growth.sql');
  assert.match(migration,/zyha_place_order_with_coupon\(uuid, text, text, jsonb, jsonb, uuid, text, text\) from public, anon, authenticated/);
  assert.match(migration,/zyha_place_order_with_coupon\(uuid, text, text, jsonb, jsonb, uuid, text, text\) to service_role/);
});
test('storefront has no automatic payment action or Snap loader',()=>{
  assert.doesNotMatch(read('src/shop/OrderReceipt.tsx'),/openSnap|action: 'payment'/);
  assert.doesNotMatch(read('src/shop/payment.ts'),/snap|midtrans/i);
});
test('Admin exposes the three supported manual payment types',()=>{
  const admin=read('src/admin/Payments.tsx');
  assert.match(admin,/\['Bank', 'E-Wallet', 'QRIS'\]/);
  assert.doesNotMatch(admin,/midtrans|snap/i);
});
