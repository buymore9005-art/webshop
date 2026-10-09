import { HttpError, object, integerMoney, gatewayStatus, verifyGatewayData } from './validation.ts';
export function env(name: string): string { const v = Deno.env.get(name)?.trim(); if (!v)
    throw new HttpError(503, `Konfigurasi server ${name} belum tersedia.`); return v; }
export async function hash(value: string, algorithm = 'SHA-256'): Promise<string> {
    return Array.from(new Uint8Array(await crypto.subtle.digest(algorithm, new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join('');
}
export async function readJson(request: Request, max = 20000): Promise<Record<string, unknown>> {
    if (!request.body)
        throw new HttpError(400, 'Permintaan kosong.');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > max) {
                await reader.cancel();
                throw new HttpError(413, 'Permintaan terlalu besar.');
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const x of chunks) {
        all.set(x, offset);
        offset += x.length;
    }
    try {
        return object(JSON.parse(new TextDecoder().decode(all)));
    }
    catch (e) {
        if (e instanceof HttpError)
            throw e;
        throw new HttpError(400, 'JSON tidak valid.');
    }
}
export function cors(request: Request): Record<string, string> {
    const origin = request.headers.get('origin');
    const allowed = env('ALLOWED_ORIGINS').split(',').map(s => s.trim().replace(/\/$/, ''));
    if (origin && !allowed.includes(origin))
        throw new HttpError(403, 'Origin tidak diizinkan.');
    return { 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}) };
}
export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
export function failure(error: unknown, headers: Record<string, string> = {}) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500)
        console.error('ZYHA request failed', status);
    return json({ error: error instanceof HttpError ? error.message : 'Layanan sedang bermasalah. Coba kembali; jangan membuat ulang pesanan sebelum memeriksa status.' }, status, headers);
}
export class Database {
    url = env('SUPABASE_URL');
    key = env('SUPABASE_SERVICE_ROLE_KEY');
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
        const res = await fetch(this.url + '/rest/v1/' + path, { ...init, signal: AbortSignal.timeout(15000), headers: { apikey: this.key, Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json', ...(init.headers || {}) } });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            const detail = body?.message;
            throw new HttpError(res.status >= 500 ? 503 : 400, typeof detail === 'string' && body?.code === 'P0001' ? detail : 'Permintaan database gagal. Periksa konfigurasi atau coba kembali.');
        }
        return body as T;
    }
    rpc<T>(name: string, body: Record<string, unknown>): Promise<T> { return this.request<T>('rpc/' + name, { method: 'POST', body: JSON.stringify(body) }); }
    async row<T>(table: string, filters: Record<string, string>): Promise<T | null> {
        const query = new URLSearchParams({ ...filters, limit: '1' });
        const rows = await this.request<T[]>(table + '?' + query);
        return rows[0] || null;
    }
    async limit(key: string, count: number, seconds = 60): Promise<void> {
        if (!await this.rpc<boolean>('zyha_rate_limit', { p_key: key, p_limit: count, p_seconds: seconds }))
            throw new HttpError(429, 'Terlalu banyak permintaan. Coba kembali setelah satu menit.');
    }
}
export interface GatewayOrder {
    id: string;
    gateway_order_id: string;
    gateway_transaction_id: string | null;
    status: string;
    total_price: number;
    shipping_fee: number;
    items: Array<{
        product_id: string;
        title: string;
        unit_price: number;
        quantity: number;
    }>;
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    payment_snapshot: {
        type: string;
        gateway_mode: 'sandbox' | 'production';
        gateway_client_key: string;
    };
}
export function gateway(mode: string) {
    if (!['sandbox', 'production'].includes(mode))
        throw new HttpError(503, 'Mode Midtrans pesanan tidak valid.');
    const key = env(mode === 'production' ? 'MIDTRANS_SERVER_KEY_PRODUCTION' : 'MIDTRANS_SERVER_KEY_SANDBOX');
    const domain = mode === 'production' ? 'midtrans.com' : 'sandbox.midtrans.com';
    return { api: `https://api.${domain}/v2`, snap: `https://app.${domain}/snap/v1/transactions`, key, auth: 'Basic ' + btoa(key + ':') };
}
export async function gatewayData(order: GatewayOrder, lookupId?: string): Promise<Record<string, unknown> | null> {
    const g = gateway(order.payment_snapshot.gateway_mode);
    const res = await fetch(`${g.api}/${encodeURIComponent(lookupId || order.gateway_transaction_id || order.gateway_order_id)}/status`, { headers: { Authorization: g.auth, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    const data = await res.json().catch(() => null);
    if (res.status === 404 || data?.status_code === '404')
        return null;
    if (!res.ok || !data)
        throw new HttpError(502, 'Status Midtrans belum dapat diperiksa.');
    verifyGatewayData(data, order.gateway_order_id, Number(order.total_price));
    return data;
}
export async function syncPayment(db: Database, order: GatewayOrder, lookupId?: string): Promise<void> {
    if (order.payment_snapshot.type !== 'Midtrans')
        return;
    const data = await gatewayData(order, lookupId);
    if (!data)
        return;
    const status = gatewayStatus(data);
    await db.rpc('zyha_apply_gateway_status', { p_id: order.id, p_status: status, p_amount: integerMoney(data.gross_amount), p_transaction: data.transaction_id, p_gateway_state: String(data.transaction_status || ''), p_refund: status === 'refunded' ? Number(order.total_price) : integerMoney(data.refund_amount ?? (status === 'partial_refund' ? null : 0)) });
}
