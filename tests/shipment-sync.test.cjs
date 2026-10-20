const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('supabase/functions/_shared/shipmentSync.ts', 'utf8');
function load() {
  const module = { exports: {} };
  class HttpError extends Error { constructor(status, text) { super(text); this.status = status; } }
  const env = { BITESHIP_API_KEY: 'mock', BITESHIP_SYNC_ENABLED: 'true', BITESHIP_SYNC_SECRET: 'x'.repeat(32) };
  const server = { env: name => { if (!env[name]) throw new HttpError(503, 'Missing'); return env[name]; }, failure: e => new Response('', { status: e.status || 500 }) };
  new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(name => name.includes('server') ? server : name.includes('validation') ? { HttpError, uuid: x => x } : {}, module, module.exports);
  return module.exports;
}
test('spoofed webhook only triggers known stored order; ignores status and waybill', async () => {
  const api = load(); const calls = [];
  await api.webhookNotification({ row: async () => ({ order_id: 'known' }) }, { event: 'order.status', order_id: 'provider', status: 'delivered', courier_waybill_id: 'FORGED' }, async (_, id) => calls.push(id));
  assert.deepEqual(calls, ['known']);
  await api.webhookNotification({ row: async () => null }, { event: 'order.status', order_id: 'unknown' }, () => assert.fail());
  await api.webhookNotification({}, { event: 'order.price', order_id: 'provider' }, () => assert.fail());
});
test('canonical provider identity and nullable waybill validation', () => {
  const api = load();
  assert.throws(() => api.canonicalSnapshot({ success: true, id: 'wrong', status: 'delivered' }, 'known'));
  assert.deepEqual(api.canonicalSnapshot({ success: true, id: 'known', status: 'returned', courier: { waybill_id: 'REAL', history: [{ status: 'returned', updated_at: '2026-10-20T00:00:00Z' }] } }, 'known'), { status: 'returned', waybill: 'REAL', timestamp: '2026-10-20T00:00:00.000Z' });
});
test('manual sync denies unauthenticated and non-admin callers', async () => {
  const api = load();
  await assert.rejects(api.manualShipmentSync({}, {}, 'id', async () => null), e => e.status === 401);
  await assert.rejects(api.manualShipmentSync({ row: async () => null }, {}, 'id', async () => 'customer'), e => e.status === 403);
});
test('scheduler rejects missing or wrong dedicated secret', async () => {
  for (const headers of [{}, { 'x-shipment-sync-secret': 'wrong' }]) assert.equal((await load().schedulerHandler(new Request('https://example.test', { method: 'POST', headers }))).status, 401);
});
test('sync claims before fetch; duplicate/busy claim does not fetch', async () => {
  const api = load(); const calls = [];
  const db = { limit: async () => {}, rpc: async (name, args) => { calls.push([name, args]); return name.includes('claim') ? { provider_id: 'known', revision: 3 } : true; } };
  await api.syncShipment(db, 'order', async id => { assert.equal(calls[0][0], 'zyha_claim_shipment_sync'); return { success: true, id, status: 'picked', courier: { waybill_id: 'REAL' } }; });
  assert.equal(calls[1][1].p_revision, 3);
  assert.equal(calls[1][1].p_snapshot.waybill, 'REAL');
  await api.syncShipment({ limit: async () => {}, rpc: async () => null }, 'order', () => assert.fail());
});
test('SQL contracts: fencing, stale protection, dedupe, private service-only RPCs, no financial writes', () => {
  const sql = fs.readFileSync('supabase/migrations/20261024000000_biteship_sync.sql', 'utf8');
  for (const pattern of [/for update/, /c.revision<>p_revision/, /stamp<o.provider_status_at/, /on conflict do nothing/, /enable row level security/, /from public,anon,authenticated/, /to service_role/, /limit 20/, /supabase_realtime add table public.orders/]) assert.match(sql, pattern);
  assert.doesNotMatch(sql, /set\s+(status|fulfillment_status|stock|paid_at)\s*=/i);
  const ui = fs.readFileSync('src/components/ShipmentStatus.tsx', 'utf8');
  for (const pattern of [/from\('orders'\)/, /postgres_changes/, /visibilitychange/, /setInterval/, /onAuthStateChange/]) assert.match(ui, pattern);
});