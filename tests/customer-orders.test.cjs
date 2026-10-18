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
test('account links to separate history and history preserves snapshot and recovery access', () => {
    const pages = read('src/shop/CustomerPages.tsx');
    const account = pages.split('export function CustomerAccount')[1].split('export function CustomerOrders')[0];
    assert.doesNotMatch(account, /getCustomerOrderHistory|customer-order-list/);
    assert.match(account, /onClick=\{onOrders\}/);
    assert.match(pages, /Photo src=\{item\.image\}/);
    assert.match(pages, /orderLabels\[order\.status\]/);
    assert.match(pages, /fulfillmentLabels\[order\.fulfillment_status\]/);
    assert.match(pages, /<Pagination page=\{page\}/);
    assert.match(pages, /controller\.signal\.aborted/);
    assert.match(pages, /onClick=\{onReceipt\}/);
    const app = read('App.tsx');
    assert.match(app, /CustomerOrders key=\{session\?\.user\.id \|\| 'guest'\}/);
    assert.match(app, /parseOrderAccessBackup\(await file\.text\(\)\)/);
    assert.match(app, /<OrderReceipt key=\{receipt\.id\}/);
});