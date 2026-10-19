const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

const orderId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
function harness(options = {}) {
  let handler;
  const calls = [];
  const env = { ALLOWED_ORIGINS: 'https://shop.test', SUPABASE_URL: 'https://db.test',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service', BITESHIP_API_KEY: 'test-provider' };
  const fetch = async (input, init) => {
    const url = new URL(input);
    calls.push(url);
    const reply = data => new Response(JSON.stringify(data));
    if (url.pathname === '/auth/v1/user') {
      if (options.expired) return new Response('{}', { status: 401 });
      return reply({ id: userId });
    }
    if (url.pathname === '/rest/v1/rpc/zyha_rate_limit') return reply(true);
    if (url.pathname === '/rest/v1/admin_users') {
      assert.equal(url.searchParams.get('user_id'), 'eq.' + userId);
      assert.equal(url.searchParams.get('is_active'), 'eq.true');
      return reply(options.nonAdmin ? [] : [{ user_id: userId }]);
    }
    if (url.pathname === '/rest/v1/shipping_shipments') {
      assert.equal(url.searchParams.get('order_id'), 'eq.' + orderId);
      return reply([{ status: 'booked', provider_shipment_id: options.providerId ?? 'provider-1' }]);
    }
    if (url.pathname === '/rest/v1/orders') {
      assert.equal(url.searchParams.get('id'), 'eq.' + orderId);
      return reply(options.missingOrder ? [] : [{ order_number: 'STORE-1' }]);
    }
    if (url.href === 'https://api.biteship.com/v1/orders/provider-1') {
      assert.equal(init.method, 'GET');
      return reply({ success: true, id: 'provider-1', reference_id: 'STORE-1',
        courier: { waybill_id: 'AWB-123' }, ...options.providerResponse });
    }
    throw new Error('Unexpected fetch: ' + url);
  };
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'module', 'exports', 'Deno', 'fetch', 'crypto', output)(
      name => load(path.resolve(path.dirname(filename), name)), module, module.exports,
      { env: { get: name => env[name] }, serve: callback => { handler = callback; } }, fetch, webcrypto);
    return module.exports;
  }
  // Execute the actual entry point and its shared modules, not a copied router.
  load('supabase/functions/rapid-api/index.ts');
  return { calls, send: async (body, authenticated = true) => {
    const response = await handler(new Request('https://local/rapid-api', {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: 'test-public',
        ...(authenticated ? { authorization: 'Bearer test-session' } : {}) }, body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  } };
}
const payload = { action: 'biteship-shipping-label', orderId };
test('real print route needs no checkout requestId or receiptToken and uses stored provider ID', async () => {
  const h = harness();
  const result = await h.send({ ...payload, provider_shipment_id: 'attacker-id' });
  assert.equal(result.status, 200);
  assert.equal(result.body.waybill, 'AWB-123');
  assert.ok(h.calls.some(url => url.href === 'https://api.biteship.com/v1/orders/provider-1'));
});
test('print route rejects invalid order UUID before shipment/provider lookup', async () => {
  for (const id of [undefined, 'provider-1', '11111111-1111-4111-8111-11111111111z']) {
    const h = harness();
    assert.deepEqual(await h.send({ ...payload, orderId: id }), { status: 400, body: { error: 'ID tidak valid.' } });
    assert.ok(!h.calls.some(url => /shipping_shipments|api.biteship/.test(url.href)));
  }
});
test('print route rejects anonymous, expired sessions and non-admins before shipment access', async () => {
  for (const [options, authenticated, status] of [[{}, false, 401], [{ expired: true }, true, 401], [{ nonAdmin: true }, true, 403]]) {
    const h = harness(options);
    assert.equal((await h.send(payload, authenticated)).status, status);
    assert.ok(!h.calls.some(url => /shipping_shipments|api.biteship/.test(url.href)));
  }
});
test('print route preserves stored booking/order binding and requires real provider AWB', async () => {
  for (const [options, status] of [
    [{ providerId: '' }, 409], [{ missingOrder: true }, 404],
    [{ providerResponse: { id: 'another-booking' } }, 409],
    [{ providerResponse: { reference_id: 'another-order' } }, 409],
    [{ providerResponse: { courier: { tracking_id: 'not-an-awb' } } }, 409],
  ]) assert.equal((await harness(options).send(payload)).status, status);
});
test('unknown actions do not fall through to checkout UUID validation', async () => {
  assert.deepEqual(await harness().send({ action: 'unknown', orderId }), {
    status: 400, body: { error: 'Tindakan tidak dikenal.' },
  });
});
test('checkout and receipt still require valid checkout credentials', async () => {
  for (const action of ['checkout', 'receipt']) {
    assert.equal((await harness().send({ action })).status, 400);
    const result = await harness().send({ action, requestId: orderId });
    assert.equal(result.status, 400);
    assert.match(result.body.error, /Bukti akses/);
  }
});