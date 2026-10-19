const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
// Transpile isolated Edge modules without importing the Deno server entry point.
function load(file) {
  const filename = path.resolve(file);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports:{}};
  new Function('require','module','exports',output)(name => load(path.resolve(path.dirname(filename), name.endsWith('.ts') ? name : name + '.ts')),module,module.exports);
  return module.exports;
}
const {normalizeShippingLabel} = load('supabase/functions/_shared/shippingLabel.ts');
const {adminShippingLabel} = load('supabase/functions/_shared/adminShippingLabel.ts');
const {shippingLabelHtml,printShippingLabel} = load('src/lib/shippingLabel.ts');
const raw = () => ({success:true,id:'provider-1',reference_id:'STORE-1',courier:{waybill_id:'AWB-123',tracking_id:'not-an-awb',company:'jne',type:'reg'},origin:null,destination:{cash_on_delivery:{amount:0}},items:null});
test('normalization preserves nulls and zero COD; strips metadata and tracking identifiers', () => {
  const result = normalizeShippingLabel({...raw(),metadata:{secret:'hidden'}},'provider-1','STORE-1');
  assert.equal(result.cod,0); assert.equal(result.routing,''); assert.deepEqual(result.items,[]);
  assert.equal(result.sender.phone,''); assert.doesNotMatch(JSON.stringify(result),/hidden|tracking_id/);
  assert.equal(normalizeShippingLabel({...raw(),destination:null},'provider-1','STORE-1').cod,null);
});
test('requires successful matching provider ID/reference and real AWB', () => {
  for (const patch of [{success:false},{id:'other'},{reference_id:'other'},{courier:{tracking_id:'fake'}},{courier:{waybill_id:null}}])
    assert.throws(() => normalizeShippingLabel({...raw(),...patch},'provider-1','STORE-1'));
  assert.throws(() => shippingLabelHtml({waybill:''}),/waybill_id/);
});
test('all print content is escaped and no provider URL becomes an asset or link', () => {
  const payload = raw(); const attack = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  payload.courier.waybill_id=attack; payload.courier.routing_code=attack;
  payload.origin={contact_name:attack,address:attack,contact_phone:attack,note:attack};
  payload.destination={...payload.origin}; payload.items=[{name:attack,quantity:1,weight:100}];
  const html = shippingLabelHtml(normalizeShippingLabel(payload,'provider-1','STORE-1'));
  assert.doesNotMatch(html,/<img|<script|<[^>]+\s(?:href|src)=/); assert.match(html,/&lt;script&gt;/);
  assert.match(html,/100mm 150mm/); assert.match(html,/bukan resi/);
});
const orderId='11111111-1111-4111-8111-111111111111';
function harness(admin=true,status='booked') {
  const calls=[];
  return {calls,db:{limit:async()=>{},row:async(table,filter)=>{
    calls.push([table,filter]);
    if(table==='admin_users') return admin ? {} : null;
    if(table==='shipping_shipments') return {status,provider_shipment_id:'provider-1'};
    return {order_number:'STORE-1'};
  }},provider:async id=>{calls.push(['provider',id]);return raw();}};
}
test('anonymous and non-admin cannot query shipment or provider',async()=>{
  for(const user of [null,'user']) {
    const h=harness(false);
    await assert.rejects(adminShippingLabel(h.db,new Request('https://local'),orderId,async()=>user,h.provider));
    assert.ok(h.calls.every(([table])=>table==='admin_users'));
  }
});
test('admin lookup binds supplied order UUID to stored provider ID and rejects unbooked states',async()=>{
  const h=harness();
  await adminShippingLabel(h.db,new Request('https://local'),orderId,async()=>'admin',h.provider);
  assert.equal(h.calls[1][1].order_id,'eq.'+orderId);
  assert.deepEqual(h.calls.at(-1),['provider','provider-1']);
  for(const status of ['created','failed','cancelled','returned']) {
    const blocked=harness(true,status);
    await assert.rejects(adminShippingLabel(blocked.db,new Request('https://local'),orderId,async()=>'admin',blocked.provider));
    assert.ok(!blocked.calls.some(([table])=>table==='provider'));
  }
});
test('popup opens synchronously and closes on failed retrieval',async()=>{
  let opened=false,closed=false;
  global.window={open:()=>{opened=true;return {opener:{},document:{body:{}},close:()=>{closed=true;}};}};
  await assert.rejects(printShippingLabel(async()=>{assert.equal(opened,true);throw new Error('missing AWB');}),/missing AWB/);
  assert.equal(closed,true);
  global.window={open:()=>null};
  await assert.rejects(printShippingLabel(async()=>{throw new Error('should not fetch');}),/pop-up/);
  delete global.window;
});