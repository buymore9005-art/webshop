import { checkoutInput, uuid, proof, string, HttpError, buildSnapPayload } from '../_shared/validation.ts';
import { cors, Database, env, failure, gateway, gatewayData, hash, json, readJson, syncPayment, type GatewayOrder } from '../_shared/server.ts';
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
        if (action === 'sync-admin' || action === 'cancel-unstarted') {
            const bearer = request.headers.get('authorization') || '';
            const auth = await fetch(env('SUPABASE_URL') + '/auth/v1/user', { headers: { apikey: db.key, Authorization: bearer }, signal: AbortSignal.timeout(10000) });
            if (!auth.ok)
                throw new HttpError(401, 'Login diperlukan.');
            const user = await auth.json();
            const admin = await db.row<{
                is_active: boolean;
            }>('admin_users', { select: 'is_active', user_id: 'eq.' + uuid(user.id) });
            if (!admin?.is_active)
                throw new HttpError(403, 'Akses Admin diperlukan.');
            const order = await db.row<GatewayOrder>('orders', { select: '*', id: 'eq.' + uuid(body.orderId) });
            if (!order)
                throw new HttpError(404, 'Pesanan tidak ditemukan.');
            if (action === 'cancel-unstarted') {
                if (order.payment_snapshot.type !== 'Midtrans')
                    throw new HttpError(400, 'Gunakan verifikasi manual untuk metode ini.');
                if (await gatewayData(order))
                    throw new HttpError(409, 'Transaksi sudah dimulai. Batalkan melalui Midtrans lalu sinkronkan.');
                if (typeof body.version !== 'number' || !Number.isInteger(body.version))
                    throw new HttpError(400, 'Versi pesanan tidak valid.');
                await db.rpc('zyha_cancel_unstarted', { p_id: order.id, p_version: body.version, p_note: string(body.note, 'Alasan', 3, 2000), p_actor: user.id });
            }
            else
                await syncPayment(db, order);
            return json({ ok: true }, 200, headers);
        }
        const requestId = uuid(body.requestId);
        const token = proof(body.receiptToken);
        if (action === 'checkout') {
            await db.limit('checkout:global', 250);
            await db.limit('checkout:' + actor, 8);
            const data = checkoutInput(body);
            await db.limit('phone:' + await hash(db.key + data.customer.phone), 6, 600);
            const existing = await db.row<{
                id: string;
            }>('orders', { select: 'id', request_id: 'eq.' + requestId });
            const method = await db.row<{
                type: string;
            }>('payment_methods', { select: 'type', id: 'eq.' + data.methodId, is_active: 'eq.true' });
            if (!method && !existing)
                throw new HttpError(400, 'Metode pembayaran tidak tersedia.');
            if (!existing && method?.type === 'Midtrans') {
                const settings = await db.row<{
                    midtrans_mode: string;
                    midtrans_enabled: boolean;
                }>('settings', { select: 'midtrans_mode,midtrans_enabled', id: 'eq.1' });
                if (!settings?.midtrans_enabled)
                    throw new HttpError(503, 'Midtrans belum diaktifkan.');
                gateway(settings.midtrans_mode);
            }
            await db.rpc('zyha_place_order', { p_request_id: requestId, p_receipt_token: token, p_request_hash: await hash(JSON.stringify(data)), p_items: data.items, p_customer: data.customer, p_method_id: data.methodId });
        }
        else if (action !== 'receipt' && action !== 'payment')
            throw new HttpError(400, 'Tindakan tidak dikenal.');
        let receipt = await db.rpc<Record<string, unknown>>('zyha_receipt', { p_request_id: requestId, p_receipt_token: token });
        if (action === 'receipt' && body.refresh === true) {
            const order = await db.row<GatewayOrder>('orders', { select: '*', id: 'eq.' + uuid(receipt.id) });
            if (order) {
                await syncPayment(db, order);
                receipt = await db.rpc('zyha_receipt', { p_request_id: requestId, p_receipt_token: token });
            }
        }
        if (action !== 'payment')
            return json({ receipt }, 200, headers);
        await db.limit('payment:' + String(receipt.id), 6);
        const context = await db.rpc<{
            token?: string;
            claim?: string;
            redirect_url?: string;
            order?: GatewayOrder;
            mode: string;
            clientKey: string;
        }>('zyha_claim_payment', { p_id: receipt.id });
        if (context.token)
            return json({ token: context.token, mode: context.mode, clientKey: context.clientKey }, 200, headers);
        const order = context.order;
        if (!order || !context.claim)
            throw new HttpError(503, 'Pembayaran belum siap.');
        const g = gateway(context.mode);
        const payload = buildSnapPayload(order);
    const response = await fetch(g.snap, { method: 'POST', headers: { Authorization: g.auth, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
        const snap = await response.json().catch(() => null);
        if (!response.ok || (typeof snap?.token !== 'string' || !snap.token))
            throw new HttpError(502, 'Token pembayaran belum tersedia. Pesanan tetap tersimpan. Periksa status sebelum mencoba lagi.');
        const saved = await db.rpc<boolean>('zyha_save_payment', { p_id: order.id, p_claim: context.claim, p_token: snap.token, p_url: typeof snap.redirect_url === 'string' ? snap.redirect_url : '' });
        if (!saved)
            throw new HttpError(409, 'Status pesanan berubah. Periksa status pembayaran.');
        return json({ token: snap.token, mode: context.mode, clientKey: context.clientKey }, 200, headers);
    }
    catch (error) {
        return failure(error, headers);
    }
});
