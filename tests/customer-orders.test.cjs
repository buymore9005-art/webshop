const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = file => fs.readFileSync(file, 'utf8');

test('showcase is restricted to catalog without a product detail', () => {
    assert.match(read('App.tsx'), /view === 'shop' && !detailId && !!brandGallery\.data\?\.length && <section className="footer-showcase"/);
});
test('history uses authenticated ownership and stable exact-count pagination, not a cap', () => {
    const api = read('src/lib/api.ts').split('export async function getCustomerOrderHistory')[1].split('export async function getAdminCoupons')[0];
    assert.match(api, /auth\.getUser\(\)/);
    assert.match(api, /if \(!auth\.user\) throw/);
    assert.match(api, /\.eq\('customer_user_id', auth\.user\.id\)/);
    assert.match(api, /count: 'exact'/);
    assert.match(api, /\.order\('created_at'.*\.order\('id'/);
    assert.match(api, /\.range\(page \* CUSTOMER_ORDER_PAGE_SIZE, \(page \+ 1\) \* CUSTOMER_ORDER_PAGE_SIZE - 1\)/);
    assert.doesNotMatch(api, /\.limit\(100\)/);
});
test('account links to history with full authenticated receipts and no recovery flow', () => {
    const pages = read('src/shop/CustomerPages.tsx');
    const account = pages.split('export function CustomerAccount')[1].split('export function CustomerOrders')[0];
    assert.doesNotMatch(account, /getCustomerOrderHistory|customer-order-list/);
    assert.match(account, /onClick=\{onOrders\}/);
    assert.match(pages, /Photo src=\{item\.image\}/);
    assert.match(pages, /orderLabels\[order\.status\]/);
    assert.match(pages, /fulfillmentLabels\[order\.fulfillment_status\]/);
    assert.match(pages, /<Pagination page=\{page\}/);
    assert.match(pages, /controller\.signal\.aborted/);
    assert.match(pages, /onReceipt\(order.id\)/);
    const app = read('App.tsx');
    assert.match(app, /CustomerOrders key=\{session\?\.user\.id \|\| 'guest'\}/);
    assert.doesNotMatch(app, /parseOrderAccessBackup|type="file"/);
    assert.match(app, /<OrderReceipt key=\{session.user.id \+ receipt.id\}/);
});
test('checkout requires verified non-anonymous login and atomic ownership', () => {
    const server = read('supabase/functions/rapid-api/index.ts');
    assert.match(server, /if \(!customerUserId\)\s+throw new HttpError\(401/);
    assert.match(server, /user.is_anonymous === true/);
    assert.match(server, /customer_user_id: 'eq.' \+ customerUserId/);
    const sql = read('supabase/migrations/20261020000000_account_checkout.sql');
    assert.match(sql, /security invoker/);
    assert.match(sql, /o.customer_user_id = \(select auth.uid\(\)\)/);
    assert.match(sql, /owner_id is distinct from p_user_id/);
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /from public, anon, authenticated/);
    assert.match(sql, /'payment_snapshot', o.payment_snapshot/);
    assert.doesNotMatch(sql, /30 days/);
    const api = read('src/lib/api.ts');
    assert.match(api, /customerUserId: auth.user.id/);
    assert.match(api, /saveAccess\(access\); \/\/ Persist idempotency proof before sending/);
    assert.match(api, /rpc\('zyha_customer_receipt'/);
});