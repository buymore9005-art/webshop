import { client, projectStorageKey } from '../../supabaseClient';
import type { CartLine, Customer, OrderAccess, Order, Product, Settings, PaymentMethod, Receipt, Summary } from '../types';
import { checkoutItems, validateCustomer, safeImageUrl, csvCell, errorMessage } from './domain';
export interface CatalogFilter {
    page: number;
    search: string;
    category: string;
    sort: string;
    admin?: boolean;
}
const PRODUCT_FIELDS = 'id,title,price,description,category,image_url,images,variants,stock,is_active,version,created_at,updated_at';
const ORDER_FIELDS = 'id,order_number,items,subtotal,shipping_fee,total_price,status,payment_method,payment_snapshot,fulfillment_status,tracking_number,carrier,created_at,customer_name,customer_phone,customer_address,customer_note,version,updated_at,inventory_note';
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
    throw error; return (data || []) as PaymentMethod[]; }
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
export async function submitOrder(cart: CartLine[], customer: Customer, methodId: string, prior: OrderAccess | null) {
    const body = { items: checkoutItems(cart), customer: validateCustomer(customer), methodId };
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
export async function loadReceipt(access: OrderAccess, refresh = false) { const x = await shopAction<{
    receipt: Receipt;
}>({ ...access, action: 'receipt', refresh }); return x.receipt; }
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
    return { rows: (data || []) as (Order & {
            inventory_note: string;
        })[], count: count || 0 };
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
