import { checkoutInput, uuid, proof, string, HttpError } from '../_shared/validation.ts';
import { cors, Database, env, failure, hash, json, readJson } from '../_shared/server.ts';
async function optionalCustomerId(request: Request): Promise<string | null> {
    const authorization = request.headers.get('authorization');
    if (!authorization)
        return null;
    const apiKey = request.headers.get('apikey');
    if (!apiKey)
        throw new HttpError(401, 'Sesi pelanggan tidak dapat diverifikasi.');
    if (authorization === 'Bearer ' + apiKey)
        return null;
    if (!authorization.startsWith('Bearer '))
        throw new HttpError(401, 'Sesi pelanggan tidak valid.');
    const response = await fetch(env('SUPABASE_URL') + '/auth/v1/user', {
        headers: { apikey: apiKey, Authorization: authorization },
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
        throw new HttpError(401, 'Sesi pelanggan telah berakhir. Masuk kembali lalu ulangi.');
    const user = await response.json();
    return uuid(user.id);
}
Deno.serve(async (request: Request) => {
    let headers: Record<string, string> = {};
    try {
        headers = cors(request);
        if (request.method === 'OPTIONS')
            return new Response(null, { status: 204, headers });
        if (request.method !== 'POST')
            throw new HttpError(405, 'Gunakan POST.');
        const body = await readJson(request);
        const db = new Database();
        // Gateway-derived IP is best-effort; a global quota also bounds guest writes.
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
        const actor = await hash(db.key + ':' + ip);
        await db.limit('request:' + actor, 90);
        const action = string(body.action, 'Tindakan', 1, 20);
        if (action === 'validate-coupon') {
            const code = string(body.code, 'Kode kupon', 3, 40).toUpperCase();
            if (!/^[A-Z0-9_-]{3,40}$/.test(code))
                throw new HttpError(400, 'Format kode kupon tidak valid.');
            const phone = string(body.phone, 'Nomor pelanggan', 10, 15);
            if (!/^62\d{8,13}$/.test(phone) || !Number.isSafeInteger(body.subtotal) || Number(body.subtotal) < 1 || Number(body.subtotal) > 1000000000)
                throw new HttpError(400, 'Data validasi kupon tidak valid.');
            const customerKey = await hash(db.key + ':' + phone);
            await db.limit('coupon-check:' + customerKey, 10, 600);
            const coupon = await db.row<{
                id: string; code: string; discount_type: 'percent' | 'fixed'; discount_value: number;
                min_subtotal: number; starts_at: string; ends_at: string | null; max_uses: number | null;
                max_uses_per_customer: number | null; times_used: number;
            }>('coupons', { select: '*', code: 'eq.' + code, is_active: 'eq.true' });
            const now = Date.now();
            if (!coupon || Date.parse(coupon.starts_at) > now || (coupon.ends_at && Date.parse(coupon.ends_at) <= now))
                throw new HttpError(400, 'Kode kupon tidak tersedia atau di luar masa berlaku.');
            const subtotal = Number(body.subtotal);
            if (subtotal < Number(coupon.min_subtotal))
                throw new HttpError(400, 'Minimum belanja untuk kupon belum tercapai.');
            if (coupon.max_uses !== null && coupon.times_used >= coupon.max_uses)
                throw new HttpError(400, 'Kupon sudah mencapai batas pemakaian.');
            if (coupon.max_uses_per_customer !== null) {
                const query = new URLSearchParams({ select: 'id', coupon_id: 'eq.' + coupon.id, customer_key: 'eq.' + customerKey, limit: String(coupon.max_uses_per_customer) });
                const uses = await db.request<Array<{ id: string }>>('coupon_redemptions?' + query);
                if (uses.length >= coupon.max_uses_per_customer)
                    throw new HttpError(400, 'Batas pemakaian kupon untuk pelanggan ini sudah tercapai.');
            }
            const discount = coupon.discount_type === 'percent'
                ? Math.floor(subtotal * coupon.discount_value / 100)
                : coupon.discount_value;
            const discountAmount = Math.min(discount, subtotal - 1);
            if (discountAmount < 1)
                throw new HttpError(400, 'Diskon kupon kurang dari Rp1 untuk subtotal ini.');
            return json({ code: coupon.code, discount_amount: discountAmount }, 200, headers);
        }
        const requestId = uuid(body.requestId);
        const token = proof(body.receiptToken);
        if (action === 'checkout') {
            await db.limit('checkout:global', 250);
            await db.limit('checkout:' + actor, 8);
            const data = checkoutInput(body);
            const customerUserId = await optionalCustomerId(request);
            const couponCode = typeof body.couponCode === 'string' ? body.couponCode.trim().toUpperCase() : '';
            if (couponCode && !/^[A-Z0-9_-]{3,40}$/.test(couponCode))
                throw new HttpError(400, 'Format kode kupon tidak valid.');
            const customerKey = await hash(db.key + ':' + data.customer.phone);
            await db.limit('phone:' + await hash(db.key + data.customer.phone), 6, 600);
            const existing = await db.row<{
                id: string;
            }>('orders', { select: 'id', request_id: 'eq.' + requestId });
            const method = await db.row<{
                type: string;
            }>('payment_methods', { select: 'type', id: 'eq.' + data.methodId, is_active: 'eq.true' });
            if ((!method || !['Bank', 'E-Wallet', 'QRIS'].includes(method.type)) && !existing)
                throw new HttpError(400, 'Metode pembayaran tidak tersedia.');
            await db.rpc('zyha_place_order_with_coupon', {
                p_request_id: requestId, p_receipt_token: token,
                p_request_hash: await hash(JSON.stringify({ ...data, couponCode })),
                p_items: data.items, p_customer: data.customer, p_method_id: data.methodId,
                p_coupon_code: couponCode, p_customer_key: customerKey,
            });
            if (customerUserId) {
                const linked = await db.rpc<boolean>('zyha_attach_customer_order', { p_request_id: requestId, p_user_id: customerUserId });
                if (!linked)
                    throw new HttpError(409, 'Pesanan ini sudah terhubung ke akun lain. Gunakan kunci pemulihan untuk membukanya.');
            }
        }
        else if (action !== 'receipt')
            throw new HttpError(400, 'Tindakan tidak dikenal.');
        let receipt = await db.rpc<Record<string, unknown>>('zyha_receipt', { p_request_id: requestId, p_receipt_token: token });
        return json({ receipt }, 200, headers);
    }
    catch (error) {
        return failure(error, headers);
    }
});
