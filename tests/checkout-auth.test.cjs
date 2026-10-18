const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('supabase/functions/rapid-api/index.ts', 'utf8');
const authSource = source.slice(source.indexOf('async function optionalCustomerId'), source.indexOf('Deno.serve'));
function verifier(response) {
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const context = vm.createContext({ HttpError, AbortSignal, env: () => 'https://example.test',
    uuid: id => { if (!id) throw new Error('invalid id'); return id; },
    fetch: async () => response });
  vm.runInContext(ts.transpile(authSource), context);
  return headers => context.optionalCustomerId(new Request('https://example.test', { headers }));
}
test('server auth distinguishes guest from a verified customer', async () => {
  const verify = verifier({ ok: true, json: async () => ({ id: 'owner-a' }) });
  assert.equal(await verify({}), null);
  assert.equal(await verify({ apikey: 'public', authorization: 'Bearer public' }), null);
  assert.equal(await verify({ apikey: 'public', authorization: 'Bearer user-token' }), 'owner-a');
});
test('server auth rejects expired, malformed and anonymous credentials', async () => {
  const headers = { apikey: 'public', authorization: 'Bearer user-token' };
  await assert.rejects(verifier({ ok: false })(headers), e => e.status === 401);
  await assert.rejects(verifier({ ok: true, json: async () => ({ id: 'guest', is_anonymous: true }) })(headers), e => e.status === 401);
  await assert.rejects(verifier({})({ apikey: 'public', authorization: 'invalid' }), e => e.status === 401);
});