const test=require('node:test'),assert=require('node:assert/strict');
const {buildPackingSlipHtml}=require('../.test-build/src/lib/shipping.js');
const order={
  order_number:'ZYHA-123',created_at:'2026-01-01T00:00:00Z',total_weight_grams:750,
  customer_name:'<script>alert(1)</script>',customer_phone:'6281234567890',
  customer_address:'Jalan <img src=x>',customer_district:'Coblong',customer_city:'Bandung',
  customer_province:'Jawa Barat',customer_postal_code:'40132',customer_note:'"><svg onload=alert(1)>',
  items:[{title:'Tas <b>baru</b>',variant:'warna "merah"',quantity:2}],
  carrier:'Kurir & Co',tracking_number:'<script>x</script>',
};
test('packing slip escapes every database/customer supplied text field',()=>{
  const html=buildPackingSlipHtml(order);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/Jalan &lt;img src=x&gt;/);
  assert.match(html,/Tas &lt;b&gt;baru&lt;\/b&gt;/);
  assert.match(html,/&quot;&gt;&lt;svg onload=alert\(1\)&gt;/);
  assert.match(html,/Kurir &amp; Co/);
  assert.doesNotMatch(html,/<script>|<img src=x>|<svg onload=/);
  assert.match(html,/bukan label pengiriman atau resi resmi kurir/);
});
