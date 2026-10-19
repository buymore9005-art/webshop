const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
// Transpile isolated Edge modules without importing the Deno server entry point.
function load(file) {
  if (file.endsWith('?inline')) {
    const asset = file.slice(0, -7);
    return {default:`data:image/${asset.endsWith('.png') ? 'png' : 'webp'};base64,${fs.readFileSync(asset).toString('base64')}`};
  }
  const filename = path.resolve(file);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports:{}};
  new Function('require','module','exports',output)(name => name === 'jsbarcode' ? {default:require(name)} : load(path.resolve(path.dirname(filename), /(?:\.ts|\?inline)$/.test(name) ? name : name + '.ts')),module,module.exports);
  return module.exports;
}
const {normalizeShippingLabel} = load('supabase/functions/_shared/shippingLabel.ts');
const {adminShippingLabel} = load('supabase/functions/_shared/adminShippingLabel.ts');
const {shippingLabelHtml,printShippingLabel,labelBarcode} = load('src/lib/shippingLabel.ts');
const raw = () => ({success:true,id:'provider-1',reference_id:'STORE-1',courier:{waybill_id:'AWB-123',tracking_id:'not-an-awb',company:'jne',type:'reg'},origin:null,destination:{cash_on_delivery:{amount:0}},items:null});
test('shipment fee is explicit, nullable and never substituted with order price', () => {
  for (const [input, expected] of [[25000,25000],[0,0],[null,null],[undefined,null],['25000',null],[-1,null],[Infinity,null],[NaN,null]]) {
    const payload = raw(); payload.price=27500; payload.courier.shipment_fee=input;
    assert.equal(normalizeShippingLabel(payload,'provider-1','STORE-1').shippingFee,expected);
  }
});
test('CODE128 SVG contains exact encoder modules with quiet zones and no dynamic markup', () => {
  for (const value of ['J00330160962','AWB-123','STORE-1','01234567890123456789']) {
    const target={}; require('jsbarcode')(target,value,{format:'CODE128',displayValue:false,margin:0});
    const bits=target.encodings.map(e=>e.data).join('');
    const svg=labelBarcode(value,86,15);
    assert.match(svg,/<svg/);
    const actual=Array(bits.length).fill('0');
    for (const match of svg.matchAll(/<rect x="(\d+)" y="0" width="(\d+)"/g)) actual.fill('1',Number(match[1])-10,Number(match[1])-10+Number(match[2]));
    assert.equal(actual.join(''),bits);
    assert.ok((bits.length+20)*0.25<=86);
    assert.doesNotMatch(svg,/<text|<script|href=|onload=/);
  }
  for (const value of ['X'.repeat(200),'Unicode-é','bad\nAWB','<script>alert(1)</script>']) {
    const svg=labelBarcode(value,40,10);
    assert.doesNotMatch(svg,/<script|onload=|href=/);
  }
  assert.match(labelBarcode('X'.repeat(200),40,10),/terlalu panjang/);
});
test('layout preserves group order, carrier, missing fee and computed item totals', () => {
  const payload=raw(); payload.items=[{name:'Dummy item',quantity:2,weight:100}];
  const html=shippingLabelHtml(normalizeShippingLabel(payload,'provider-1','STORE-1'));
  const groups=['class="brand"','Nomor Resi -','Ongkos Kirim','Reference Number','PENERIMA','PENGIRIM','Jenis Barang','CATATAN','Pengiriman melalui platform'];
  groups.reduce((last,group)=>{const next=html.indexOf(group);assert.ok(next>last);return next;},-1);
  assert.match(html,/Rp -/); assert.match(html,/alt="jne"/); assert.doesNotMatch(html,/J&T Express/);
  assert.match(html,/200 g/); assert.match(html,/default-src 'none'/);
  assert.doesNotMatch(html.replace(/<img[^>]*>/g,''),/overflow:hidden|max-height:/);
});
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
  payload.courier.waybill_id='J00330160962'; payload.courier.routing_code=attack;
  payload.courier.company=attack;
  payload.origin={contact_name:attack,address:attack,contact_phone:attack,note:attack};
  payload.destination={...payload.origin}; payload.items=[{name:attack,quantity:1,weight:100}];
  const html = shippingLabelHtml(normalizeShippingLabel(payload,'provider-1','STORE-1'));
  assert.doesNotMatch(html.replace(/<img alt="Biteship" src="data:image\/png;base64,[A-Za-z0-9+/=]+"[^>]*>/g,''),/<img|<script|<[^>]+\s(?:href|src)=/); assert.match(html,/&lt;script&gt;/);
  assert.match(html,/100mm 150mm/); assert.match(html,/bukan resi/);
});
const orderId='11111111-1111-4111-8111-111111111111';
test('realistic AWB is mandatory while long internal reference stays text only', () => {
  const payload=raw(); payload.courier.waybill_id='J00330160962'; payload.courier.company='jnt';
  delete payload.reference_id;
  const label=normalizeShippingLabel(payload,'provider-1','ZYHA-91532DFACD9647D0A2764E2419C68964');
  const html=shippingLabelHtml(label);
  assert.equal((html.match(/<svg/g)||[]).length,1);
  assert.match(html,/width="35.75mm"/);
  assert.match(html,/reference-text-only/);
  assert.match(html,/data:image\/png;base64,/);
  assert.match(html,/img-src data:/);
  assert.throws(()=>shippingLabelHtml({...label,waybill:'X'.repeat(200)}),/ukuran aman/);
  const {courierLogo}=load('src/lib/courierLogos.ts');
  for(const code of ['jnt','jne','sicepat','anteraja','pos','tiki']) assert.match(courierLogo(code),/^data:image\/(png|webp);base64,/);
  for(const code of ['unknown','__proto__','https://evil.test/logo.svg']) assert.equal(courierLogo(code),undefined);
});
test('print waits for image decoding and layout', async () => {
  const events=[]; let finishDecode;
  const image={decode:()=>new Promise(resolve=>{finishDecode=resolve;})};
  const popup={closed:false,document:{body:{},images:[image],fonts:{ready:Promise.resolve()},open(){},write(){},close(){}},
    requestAnimationFrame(fn){events.push('layout');fn();return 1;},focus(){},print(){events.push('print');},close(){events.push('close');}};
  global.window={open:()=>popup};
  try {
    const printing=printShippingLabel(async()=>normalizeShippingLabel(raw(),'provider-1','STORE-1'));
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(events,[]); finishDecode(); await printing;
    assert.deepEqual(events,['layout','print']);
  } finally { delete global.window; }
});
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