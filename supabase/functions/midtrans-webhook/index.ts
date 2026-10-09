import { HttpError, string, equalHex } from '../_shared/validation.ts';
import { Database, failure, gateway, hash, json, readJson, syncPayment, type GatewayOrder } from '../_shared/server.ts';
Deno.serve(async (request: Request) => {
    try {
        if (request.method !== 'POST')
            throw new HttpError(405, 'POST only');
        const body = await readJson(request, 50000);
        const id = string(body.order_id, 'Order ID', 41, 41);
        if (!/^ZYHA-[0-9a-f-]{36}$/.test(id))
            throw new HttpError(400, 'Invalid order');
        const signature = string(body.signature_key, 'Signature', 128, 128).toLowerCase();
        const db = new Database();
        const order = await db.row<GatewayOrder>('orders', { select: '*', gateway_order_id: 'eq.' + id });
        if (!order || order.payment_snapshot.type !== 'Midtrans')
            throw new HttpError(404, 'Order not found');
        const g = gateway(order.payment_snapshot.gateway_mode);
        const expected = await hash(id + string(body.status_code, 'Status code', 3, 3) + string(body.gross_amount, 'Amount', 1, 30) + g.key, 'SHA-512');
        if (!equalHex(signature, expected))
            throw new HttpError(403, 'Invalid signature');
        // Signature alone does not cover every JSON field. GET status is authoritative.
        await syncPayment(db, order, typeof body.transaction_id === 'string' && body.transaction_id.length <= 100 ? body.transaction_id : undefined);
        return json({ ok: true });
    }
    catch (error) {
        return failure(error);
    }
});
