const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { safeShippingUrl, providerShipmentLinks, visibleShipmentLinks } = require('../.test-build/supabase/functions/_shared/shipmentLinks.js');

test('courier.link is tracking only; no label is fabricated', () => {
  assert.deepEqual(providerShipmentLinks({courier:{link:'https://track.example/123'}}), {
    label_url:'', tracking_url:'https://track.example/123',
  });
  assert.deepEqual(providerShipmentLinks({}), {label_url:'',tracking_url:''});
});
test('explicit provider labels and tracking remain separate', () => {
  assert.deepEqual(providerShipmentLinks({label_url:'https://label.example/a.pdf',courier:{label_url:'https://label.example/b.pdf',link:'https://track.example/123'}}), {
    label_url:'https://label.example/a.pdf',tracking_url:'https://track.example/123',
  });
  assert.equal(providerShipmentLinks({courier:{label_url:'https://label.example/b.pdf'}}).label_url,'https://label.example/b.pdf');
});
test('unsafe and malformed links are rejected rather than truncated', () => {
  for (const value of [null, {}, 'javascript:alert(1)', 'http://example.com', '//example.com', 'https://', 'https:///example.com', 'https://user:pass@example.com', 'https://example.com/\nfoo', 'https://example.com/\\foo', 'https://example.com/'+'x'.repeat(2048)]) {
    assert.equal(safeShippingUrl(value), '', String(value));
  }
  assert.equal(safeShippingUrl('https://example.com/label?signature=a%2Fb'), 'https://example.com/label?signature=a%2Fb');
});
test('historic URLs are hidden as labels without deleting or guessing their purpose', () => {
  for (const label_url of ['https://track.example/123', 'https://label.example/genuine.pdf']) {
    const historic = {label_url};
    assert.equal(visibleShipmentLinks(historic).label_url, '');
    assert.equal(historic.label_url, label_url);
    assert.equal(visibleShipmentLinks({...historic,label_url_verified:true}).label_url,label_url);
  }
  assert.deepEqual(visibleShipmentLinks(null), {label_url:'',tracking_url:''});
  assert.equal(visibleShipmentLinks({label_url:'javascript:alert(1)',label_url_verified:true}).label_url,'');
});
test('backend and UI use separated links and migration preserves legacy RPC', () => {
  const backend = fs.readFileSync('supabase/functions/rapid-api/index.ts','utf8');
  assert.match(backend,/providerShipmentLinks\(providerOrder\)/);
  assert.match(backend,/'zyha_complete_biteship_shipment_v2'/);
  assert.doesNotMatch(backend,/courier\.link/);
  const ui = fs.readFileSync('src/admin/Orders.tsx','utf8');
  assert.match(ui,/href=\{shipmentLinks.label_url\}/);
  assert.match(ui,/href=\{shipmentLinks.tracking_url\}/);
  assert.match(ui,/Label resmi provider belum tersedia atau belum terverifikasi/);
  assert.doesNotMatch(ui,/Buat booking & label/);
  const sql = fs.readFileSync('supabase/migrations/20261021000000_shipment_links.sql','utf8');
  assert.match(sql,/label_url_verified boolean not null default false/);
  assert.match(sql,/perform public.zyha_complete_biteship_shipment\(/);
  assert.doesNotMatch(sql,/drop function|set label_url\s*=/i);
  assert.match(sql,/from public,anon,authenticated/);
});