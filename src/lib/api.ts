import { client, projectStorageKey } from '../../supabaseClient';
import type { Article, CartLine, Coupon, Customer, FooterInfo, OrderAccess, Order, Product, Settings, PaymentMethod, Receipt, Summary } from '../types';
import { articleSlug, checkoutItems, validateCustomer, safeFooterHref, safeImageUrl, csvCell, errorMessage, serializeOrderAccessBackup } from './domain';
import type { ProductImportRow } from './domain';
export interface CatalogFilter {
    page: number;
    search: string;
    category: string;
    sort: string;
    admin?: boolean;
}
const PRODUCT_FIELDS = 'id,title,price,description,category,image_url,images,variants,stock,is_active,version,created_at,updated_at';
const ORDER_FIELDS = 'id,order_number,items,subtotal,shipping_fee,coupon_code,discount_amount,total_price,status,payment_method,payment_snapshot,fulfillment_status,tracking_number,carrier,created_at,customer_name,customer_phone,customer_address,customer_note,version,updated_at';
const ARTICLE_FIELDS = 'id,slug,title,excerpt,body,cover_image_url,status,published_at,created_at,updated_at';
export async function getProducts(filter: CatalogFilter, signal?: AbortSignal) {
    let q = client().from('products').select(PRODUCT_FIELDS, { count: 'exact' });
    if (!filter.admin)
        q = q.eq('is_active', true);
    if (filter.category)
        q = q.eq('category', filter.category);
    const search = filter.search.trim().slice(0, 100).replace(/[\\%_]/g, '\\$&');
    if (search)
        q = q.ilike('title', `%${search}%`);
    const by = filter.sort === 'price_asc' || filter.sort === 'price_desc' ? 'price' : 'created_at';
    q = q.order(by, { ascending: filter.sort === 'price_asc' }).order('id').range(filter.page * 16, filter.page * 16 + 15);
    if (signal)
        q = q.abortSignal(signal);
    const { data, error, count } = await q;
    if (error)
        throw error;
    return { rows: (data || []) as Product[], count: count || 0 };
}
export async function getProduct(id: string) { const { data, error } = await client().from('products').select(PRODUCT_FIELDS).eq('id', id).eq('is_active', true).maybeSingle(); if (error)
    throw error; return data as Product | null; }
export async function getSettings() { const { data, error } = await client().from('settings').select('*').eq('id', 1).single(); if (error)
    throw error; return data as Settings; }
export async function getMethods(admin = false) { let q = client().from('payment_methods').select('*').order('sort_order').order('name'); if (!admin)
    q = q.eq('is_active', true); const { data, error } = await q; if (error)
    throw error; return ((data || []) as PaymentMethod[]).filter(method => ['Bank', 'E-Wallet', 'QRIS'].includes(method.type)); }
export async function shopAction<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await client().functions.invoke('rapid-api', { body });
    if (error) {
        let message = errorMessage(error);
        try {
            const detail = await error.context?.json();
            if (typeof detail?.error === 'string')
                message = detail.error;
        }
        catch { /* Keep transport error */ }
        throw new Error(message);
    }
    if (!data || data.error)
        throw new Error(data?.error || 'Respons server tidak lengkap.');
    return data as T;
}
export async function getPublishedArticles() {
    const { data, error } = await client().from('articles').select(ARTICLE_FIELDS).eq('status', 'published').order('published_at', { ascending: false }).order('id');
    if (error)
        throw error;
    return (data || []) as Article[];
}
export async function getPublishedArticle(slug: string) {
    const { data, error } = await client().from('articles').select(ARTICLE_FIELDS).eq('slug', articleSlug(slug)).eq('status', 'published').maybeSingle();
    if (error)
        throw error;
    return data as Article | null;
}
export async function getFooterInfo() {
    const { data, error } = await client().from('footer_info').select('id,title,content,href,sort_order,is_active').eq('is_active', true).order('sort_order').order('title');
    if (error)
        throw error;
    return (data || []) as FooterInfo[];
}
export async function getAdminArticles() {
    const { data, error } = await client().from('articles').select(ARTICLE_FIELDS).order('updated_at', { ascending: false });
    if (error)
        throw error;
    return (data || []) as Article[];
}
export async function saveArticle(article: Omit<Article, 'id' | 'created_at' | 'updated_at' | 'published_at'> & { id?: string }) {
    let previousPublishedAt: string | null = null;
    if (article.id) {
        const { data, error } = await client().from('articles').select('status,published_at').eq('id', article.id).maybeSingle();
        if (error)
            throw error;
        if (!data)
            throw new Error('Artikel tidak ditemukan atau izin tidak tersedia.');
        previousPublishedAt = data.status === 'published' ? data.published_at : null;
    }
    const payload = {
        slug: articleSlug(article.slug || article.title),
        title: article.title.trim(),
        excerpt: article.excerpt.trim(),
        body: article.body.trim(),
        cover_image_url: safeImageUrl(article.cover_image_url),
        status: article.status,
        published_at: article.status === 'published' ? previousPublishedAt || new Date().toISOString() : null,
    };
    if (payload.title.length < 3 || payload.title.length > 180 || payload.excerpt.length > 500 || !payload.body || payload.body.length > 30000)
        throw new Error('Lengkapi judul (3–180 karakter), isi (maksimal 30.000 karakter), dan ringkasan (maksimal 500 karakter).');
    if (article.cover_image_url && !payload.cover_image_url)
        throw new Error('URL foto sampul harus berupa HTTPS yang valid.');
    const query = article.id ? client().from('articles').update(payload).eq('id', article.id) : client().from('articles').insert(payload);
    const { data, error } = await query.select(ARTICLE_FIELDS).single();
    if (error)
        throw error;
    return data as Article;
}
export async function deleteArticle(id: string) {
    const { error } = await client().from('articles').delete().eq('id', id);
    if (error)
        throw error;
}
export async function getAdminFooterInfo() {
    const { data, error } = await client().from('footer_info').select('*').order('sort_order').order('title');
    if (error)
        throw error;
    return (data || []) as FooterInfo[];
}
export async function saveFooterInfo(item: Omit<FooterInfo, 'id'>, id?: string) {
    const payload = { title: item.title.trim(), content: item.content.trim(), href: safeFooterHref(item.href), sort_order: item.sort_order, is_active: item.is_active };
    if (payload.title.length < 2 || payload.title.length > 100 || payload.content.length > 1000 || !Number.isInteger(payload.sort_order))
        throw new Error('Judul, isi informasi, atau urutan footer tidak valid.');
    if (!payload.content && !payload.href)
        throw new Error('Isi informasi atau tautan harus diisi.');
    const query = id ? client().from('footer_info').update(payload).eq('id', id) : client().from('footer_info').insert(payload);
    const { data, error } = await query.select('*').single();
    if (error)
        throw error;
    return data as FooterInfo;
}
export async function deleteFooterInfo(id: string) {
    const { error } = await client().from('footer_info').delete().eq('id', id);
    if (error)
        throw error;
}
export async function getWishlist() {
    const { data: saved, error } = await client().from('wishlist_items').select('product_id').order('created_at', { ascending: false });
    if (error)
        throw error;
    const ids = (saved || []).map(item => item.product_id as string);
    if (!ids.length)
        return [] as Product[];
    const { data, error: productsError } = await client().from('products').select(PRODUCT_FIELDS).in('id', ids).eq('is_active', true);
    if (productsError)
        throw productsError;
    const products = (data || []) as Product[];
    const byId = new Map(products.map(product => [product.id, product]));
    return ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
}
export async function setWishlisted(productId: string, saved: boolean) {
    if (saved) {
        const { error } = await client().from('wishlist_items').upsert({ product_id: productId }, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
        if (error)
            throw error;
    }
    else {
        const { error } = await client().from('wishlist_items').delete().eq('product_id', productId);
        if (error)
            throw error;
    }
}
export async function getCustomerOrderHistory() {
    const { data, error } = await client().from('orders').select('id,order_number,items,total_price,coupon_code,discount_amount,status,fulfillment_status,tracking_number,carrier,created_at').order('created_at', { ascending: false }).limit(100);
    if (error)
        throw error;
    return data || [];
}
export async function getAdminCoupons() {
    const { data, error } = await client().from('coupons').select('*').order('created_at', { ascending: false });
    if (error)
        throw error;
    return (data || []) as Coupon[];
}
export async function saveCoupon(value: Omit<Coupon, 'id' | 'times_used'>, id?: string) {
    const code = value.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(code))
        throw new Error('Kode kupon harus berisi 3–40 huruf, angka, garis bawah, atau tanda hubung.');
    if (!Number.isInteger(value.discount_value) || value.discount_value < 1 || (value.discount_type === 'percent' && value.discount_value > 99) || (value.discount_type === 'fixed' && value.discount_value > 1000000000))
        throw new Error('Nilai diskon kupon tidak valid.');
    if (!Number.isSafeInteger(value.min_subtotal) || value.min_subtotal < 0 || value.min_subtotal > 1000000000)
        throw new Error('Minimum belanja tidak valid.');
    for (const limit of [value.max_uses, value.max_uses_per_customer]) {
        if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 1000000))
            throw new Error('Batas penggunaan harus kosong atau bilangan bulat 1–1.000.000.');
    }
    const starts = new Date(value.starts_at), ends = value.ends_at ? new Date(value.ends_at) : null;
    if (Number.isNaN(starts.getTime()) || (ends && (Number.isNaN(ends.getTime()) || ends <= starts)))
        throw new Error('Periode berlaku kupon tidak valid.');
    const payload = {
        code, discount_type: value.discount_type, discount_value: value.discount_value,
        min_subtotal: value.min_subtotal, starts_at: starts.toISOString(), ends_at: ends?.toISOString() || null,
        max_uses: value.max_uses, max_uses_per_customer: value.max_uses_per_customer, is_active: value.is_active,
    };
    const query = id ? client().from('coupons').update(payload).eq('id', id) : client().from('coupons').insert(payload);
    const { data, error } = await query.select('*').single();
    if (error)
        throw error;
    return data as Coupon;
}
export async function validateCoupon(code: string, subtotal: number, phone: string) {
    return shopAction<{ code: string; discount_amount: number }>({ action: 'validate-coupon', code, subtotal, phone });
}
export function readOrderAccess(): OrderAccess | null {
    try {
        const x = JSON.parse(sessionStorage.getItem(projectStorageKey + 'order-access') || 'null');
        return x && typeof x.signature === 'string' && /^[0-9a-f]{64}$/.test(x.receiptToken) && /^[0-9a-f-]{36}$/.test(x.requestId) ? x : null;
    }
    catch {
        return null;
    }
}
function saveAccess(value: OrderAccess) { try {
    sessionStorage.setItem(projectStorageKey + 'order-access', JSON.stringify(value));
}
catch { /* In-memory access still works; receipt page explains per-tab storage. */ } }
export function downloadOrderAccessBackup(access: OrderAccess, orderNumber: string) {
    const contents = serializeOrderAccessBackup(access, orderNumber);
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `zyha-order-access-${orderNumber}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function submitOrder(cart: CartLine[], customer: Customer, methodId: string, prior: OrderAccess | null, couponCode = '') {
    const body = { items: checkoutItems(cart), customer: validateCustomer(customer), methodId, couponCode };
    const signature = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)))), n => n.toString(16).padStart(2, '0')).join('');
    const existing = prior?.signature === signature ? prior : readOrderAccess();
    const access: OrderAccess = existing?.signature === signature ? existing : { requestId: crypto.randomUUID(), receiptToken: Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''), signature };
    saveAccess(access); // Persist idempotency proof before sending; no address/phone is persisted here.
    const result = await shopAction<{
        receipt: Receipt;
    }>({ ...body, ...access, action: 'checkout' });
    if (!result.receipt?.id)
        throw new Error('Pesanan belum dikonfirmasi server.');
    access.id = result.receipt.id;
    saveAccess(access);
    return { access, receipt: result.receipt };
}
export async function loadReceipt(access: OrderAccess) { const x = await shopAction<{
    receipt: Receipt;
}>({ ...access, action: 'receipt' }); return x.receipt; }
export async function saveProduct(value: Partial<Product>, original?: Product) {
    const payload = { title: value.title?.trim(), description: value.description?.trim() || '', category: value.category?.trim() || '', price: Number(value.price), stock: value.stock === null ? null : Number(value.stock), image_url: value.image_url || '', images: value.images || [], variants: (value.variants || []).map(v => ({ name: v.name.trim(), image: v.image.trim() })), is_active: value.is_active ?? true };
    if (!payload.title || !Number.isSafeInteger(payload.price) || payload.price < 1 || payload.price > 1e9)
        throw new Error('Nama dan harga produk tidak valid.');
    if (payload.stock !== null && (!Number.isInteger(payload.stock) || payload.stock < 0))
        throw new Error('Stok harus bilangan bulat nonnegatif.');
    const query = original ? client().from('products').update(payload).eq('id', original.id).eq('version', original.version) : client().from('products').insert(payload);
    const { data, error } = await query.select(PRODUCT_FIELDS).maybeSingle();
    if (error)
        throw error;
    if (!data)
        throw new Error('Produk berubah sejak dibuka. Muat ulang sebelum menyimpan.');
    return data as Product;
}
export async function importProducts(products: ProductImportRow[]) {
    if (!products.length || products.length > 250)
        throw new Error('Impor harus berisi 1–250 produk.');
    const rows = products.map(product => ({
        title: product.title.trim(),
        price: product.price,
        description: product.description.trim(),
        category: product.category.trim(),
        image_url: safeImageUrl(product.image_url),
        images: [] as string[],
        variants: [] as Product['variants'],
        stock: product.stock,
        is_active: product.is_active,
    }));
    const { data, error } = await client().from('products').insert(rows).select('id');
    if (error)
        throw error;
    if (data?.length !== products.length)
        throw new Error('Respons impor tidak lengkap; periksa katalog sebelum mengulangi impor.');
    return data.length;
}
export async function saveMethod(value: Omit<PaymentMethod, 'id'>, id?: string) { const q = id ? client().from('payment_methods').update(value).eq('id', id) : client().from('payment_methods').insert(value); const { data, error } = await q.select('id').single(); if (error)
    throw error; return data; }
export async function saveSettings(payload: Partial<Settings>, expected?: string) { let q = client().from('settings').update(payload).eq('id', 1); if (expected)
    q = q.eq('updated_at', expected); const { data, error } = await q.select('*').maybeSingle(); if (error)
    throw error; if (!data)
    throw new Error('Pengaturan telah diubah. Muat ulang terlebih dahulu.'); return data as Settings; }
export async function uploadImage(file: File, prefix: string) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0)
        throw new Error('Gunakan JPG, PNG, atau WebP maksimal 5 MB.');
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png = bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
    const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (!((file.type === 'image/jpeg' && jpg) || (file.type === 'image/png' && png) || (file.type === 'image/webp' && webp)))
        throw new Error('Isi file tidak sesuai format gambar.');
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await client().storage.from('products').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '31536000' });
    if (error)
        throw error;
    return safeImageUrl(client().storage.from('products').getPublicUrl(path).data.publicUrl);
}
export async function getOrders(page: number, status: string, search: string, start: string, end: string) {
    if (start && end && start > end)
        throw new Error('Tanggal awal tidak boleh melewati tanggal akhir.');
    let q = client().from('orders').select(ORDER_FIELDS, { count: 'exact' }).order('created_at', { ascending: false }).order('id');
    if (status)
        q = q.eq('status', status);
    if (search.trim())
        q = q.ilike('order_number', `%${search.trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)}%`);
    if (start)
        q = q.gte('created_at', start + 'T00:00:00+07:00');
    if (end)
        q = q.lt('created_at', new Date(new Date(end + 'T00:00:00+07:00').getTime() + 86400000).toISOString());
    const { data, error, count } = await q.range(page * 20, page * 20 + 19);
    if (error)
        throw error;
    return { rows: (data || []) as Order[], count: count || 0 };
}
export async function orderAction(id: string, version: number, action: string, note: string, tracking = '', carrier = '') {
    const { data, error } = await client().rpc('zyha_admin_order_action', { p_id: id, p_version: version, p_action: action, p_note: note, p_tracking: tracking, p_carrier: carrier });
    if (error)
        throw error;
    if (data?.ok !== true)
        throw new Error('Perubahan belum dikonfirmasi server.');
}
export async function getSummary(start = '', end = '') {
    const { data, error } = await client().rpc('zyha_dashboard', { p_start: start ? start + 'T00:00:00+07:00' : null, p_end: end ? new Date(new Date(end + 'T00:00:00+07:00').getTime() + 86400000).toISOString() : null });
    if (error)
        throw error;
    return data as Summary;
}
export function exportOrderPage(rows: Order[]) {
    if (!rows.length)
        throw new Error('Tidak ada pesanan untuk diekspor.');
    const data = [['Nomor', 'Tanggal', 'Nama', 'WhatsApp', 'Alamat', 'Pembayaran', 'Status', 'Pengiriman', 'Total', 'Resi'], ...rows.map(r => [r.order_number, r.created_at, r.customer_name, r.customer_phone, r.customer_address, r.payment_method, r.status, r.fulfillment_status, r.total_price, r.tracking_number])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + data.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pesanan-halaman-' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
