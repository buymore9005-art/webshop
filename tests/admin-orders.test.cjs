const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { availableOrderActions, canBookOrderShipment, requiresOrderReason, adminOrderActions } = require('../.test-build/src/lib/adminOrders.js');
const state = (status, fulfillment_status = 'unfulfilled', shipping_quote_id = null) => ({ status, fulfillment_status, shipping_quote_id });

test('pending orders only expose explicit payment verification and cancellation', () => {
  assert.deepEqual(availableOrderActions(state('pending')), ['paid', 'cancelled']);
  assert.equal(canBookOrderShipment(state('pending', 'processing', 'quote')), false);
});
test('paid and partially refunded orders follow each fulfillment transition', () => {
  for (const status of ['paid', 'partial_refund']) {
    assert.deepEqual(availableOrderActions(state(status)), ['processing']);
    assert.deepEqual(availableOrderActions(state(status, 'processing')), ['shipped']);
    assert.deepEqual(availableOrderActions(state(status, 'shipped')), ['completed']);
    assert.deepEqual(availableOrderActions(state(status, 'completed')), []);
  }
});
test('Biteship orders cannot bypass booking with manual shipping', () => {
  for (const status of ['paid', 'partial_refund']) {
    assert.deepEqual(availableOrderActions(state(status, 'processing', 'quote')), []);
    assert.equal(canBookOrderShipment(state(status, 'processing', 'quote')), true);
    for (const fulfillment of ['unfulfilled', 'shipped', 'completed']) {
      assert.equal(canBookOrderShipment(state(status, fulfillment, 'quote')), false);
    }
  }
  assert.equal(canBookOrderShipment(state('paid', 'processing')), false);
});
test('terminal and unknown payment states never expose mutation actions', () => {
  for (const status of ['cancelled', 'expired', 'failed', 'refunded', 'unknown']) {
    for (const fulfillment of ['unfulfilled', 'processing', 'shipped', 'completed']) {
      assert.deepEqual(availableOrderActions(state(status, fulfillment, 'quote')), []);
      assert.equal(canBookOrderShipment(state(status, fulfillment, 'quote')), false);
    }
  }
});
test('admin UI keeps confirmation, audit notes, version checks, and booking error guards', () => {
  const source = fs.readFileSync('src/admin/Orders.tsx', 'utf8');
  assert.doesNotMatch(source, /<option value="(?:paid|cancelled|processing|shipped|completed)"/);
  assert.match(source, /orderAction\(editing.id, editing.version, action, reason, tracking, carrier\)/);
  assert.match(source, /\['paid', 'cancelled'\].includes\(action\) && !confirmed/);
  assert.match(source, /type="checkbox" required checked=\{confirmed\}/);
  assert.match(source, /textarea required minLength=\{3\} maxLength=\{2000\}/);
  assert.match(source, /shipment.loading \|\| shipment.error \|\| shipment.data/);
});
test('fulfillment filter is applied server-side before pagination', () => {
  const api = fs.readFileSync('src/lib/api.ts', 'utf8');
  assert.match(api, /if \(fulfillment\)\s+q = q.eq\('fulfillment_status', fulfillment\)/);
  assert.match(fs.readFileSync('Admin.tsx', 'utf8'), /navigationGroups.map/);
  assert.match(fs.readFileSync('Admin.tsx', 'utf8'), /aria-current=\{view === key \? 'page'/);
});
test('only the two normal transitions omit reasons', () => {
  for (const action of Object.keys(adminOrderActions)) {
    assert.equal(requiresOrderReason(action), !['paid', 'processing'].includes(action));
  }
  assert.equal(adminOrderActions.paid, 'Konfirmasi pembayaran');
  assert.equal(adminOrderActions.processing, 'Proses pesanan');
});
test('primary steps stay ordered with explicit booking and separate exceptions', () => {
  const source = fs.readFileSync('src/admin/Orders.tsx', 'utf8');
  assert.ok(source.indexOf('1. Konfirmasi pembayaran') < source.indexOf('2. Proses pesanan'));
  assert.ok(source.indexOf('2. Proses pesanan') < source.indexOf('3. Cetak label'));
  assert.ok(source.indexOf('3. Cetak label') < source.indexOf('Tindakan lanjutan / pengecualian'));
  assert.doesNotMatch(source, /Alasan \/ catatan verifikasi/);
  assert.match(source, /requiresOrderReason\(action\) && <Field label="Alasan tindakan"/);
  assert.match(source, /Booking membuat pengiriman nyata dan dapat menimbulkan biaya kurir/);
  assert.match(source, /Buat booking Biteship/);
  assert.match(source, /jangan membuat booking ulang/);
  assert.match(source, /printShippingLabel\(\(\) => shopAction<ShippingLabel>/);
  assert.match(source, /edit\(data as Order\)/);
});
test('migration preserves locked transitions, audit and exception reasons', () => {
  const sql = fs.readFileSync('supabase/migrations/20261022000000_admin_primary_workflow.sql', 'utf8');
  assert.match(sql, /if p_action in \('paid', 'processing'\) then/);
  assert.match(sql, /elsif p_note is null or length\(btrim\(p_note\)\) not between 3 and 2000/);
  assert.match(sql, /public.zyha_is_admin\(\)/);
  assert.match(sql, /where id = p_id for update/);
  assert.match(sql, /p_version is null or r.version <> p_version/);
  assert.match(sql, /version = version \+ 1/);
  assert.match(sql, /r.status not in \('paid', 'partial_refund'\)/);
  assert.match(sql, /p_action = 'shipped' and r.shipping_quote_id is not null/);
  assert.match(sql, /insert into public.order_events\(order_id, actor_id, event, old_status, new_status, note\)/);
  assert.match(sql, /auth.uid\(\), 'admin_' \|\| p_action/);
  assert.match(sql, /coalesce\(btrim\(p_note\), ''\)/);
  assert.match(sql, /from public,anon/);
});