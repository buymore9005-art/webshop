const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { availableOrderActions, canBookOrderShipment } = require('../.test-build/src/lib/adminOrders.js');
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