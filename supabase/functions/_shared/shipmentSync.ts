import { Database, env, readJson, json, failure } from './server.ts';
import { getOrder } from './biteship.ts';
import { HttpError, uuid } from './validation.ts';

export function canonicalSnapshot(data: Record<string, unknown>, id: string) {
    if (data.success !== true || data.id !== id || typeof data.status !== 'string' || !/^[a-z_]{1,60}$/.test(data.status))
        throw new HttpError(502, 'Invalid canonical shipment.');
    const courier = data.courier as Record<string, unknown> | null;
    const waybill = courier?.waybill_id;
    if (waybill != null && (typeof waybill !== 'string' || waybill.length > 120))
        throw new HttpError(502, 'Invalid canonical waybill.');
    const history = Array.isArray(courier?.history) ? courier.history : [];
    const times = history.filter(h => h && h.status === data.status && typeof h.updated_at === 'string')
        .map(h => Date.parse(h.updated_at)).filter(Number.isFinite);
    return { status: data.status, waybill: waybill || null, timestamp: times.length ? new Date(Math.max(...times)).toISOString() : null };
}

export async function syncShipment(db: Database, orderId: string, fetchOrder = getOrder) {
    if (env('BITESHIP_SYNC_ENABLED') !== 'true') throw new HttpError(503, 'Sync disabled.');
    env('BITESHIP_API_KEY');
    await db.limit('shipment-sync:global', 60);
    await db.limit('shipment-sync:' + orderId, 2);
    const claim = await db.rpc<{ provider_id: string; revision: number } | null>('zyha_claim_shipment_sync', { p_order_id: orderId });
    if (!claim) return { synced: false };
    try {
        const snapshot = canonicalSnapshot(await fetchOrder(claim.provider_id), claim.provider_id);
        const synced = await db.rpc<boolean>('zyha_finish_shipment_sync', { p_order_id: orderId, p_revision: claim.revision, p_snapshot: snapshot });
        return { synced };
    } catch (error) {
        await db.rpc('zyha_finish_shipment_sync', { p_order_id: orderId, p_revision: claim.revision, p_snapshot: null });
        throw error;
    }
}

export async function manualShipmentSync(db: Database, request: Request, orderId: unknown, identify: (request: Request) => Promise<string | null>) {
    const user = await identify(request);
    if (!user) throw new HttpError(401, 'Authentication required.');
    if (!await db.row('admin_users', { select: 'user_id', user_id: 'eq.' + user, is_active: 'eq.true' }))
        throw new HttpError(403, 'Admin required.');
    return syncShipment(db, uuid(orderId));
}

// The public Biteship docs do not specify a signature/header algorithm. Treat
// notifications ONLY as untrusted wake-ups, never as shipping data or authority.
export async function webhookNotification(db: Database, body: Record<string, unknown>, sync = syncShipment) {
    if (!['order.status', 'order.waybill_id'].includes(String(body.event))) return;
    if (typeof body.order_id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(body.order_id)) return;
    const shipment = await db.row<{ order_id: string }>('shipping_shipments', {
        select: 'order_id', provider_code: 'eq.biteship', provider_shipment_id: 'eq.' + body.order_id,
    });
    if (shipment) await sync(db, shipment.order_id);
}

export async function webhookHandler(request: Request) {
    try {
        if (request.method !== 'POST') throw new HttpError(405, 'POST required.');
        const body = await readJson(request, 16000, true);
        // Installation probes acknowledge reachability only, never mutate shipments.
        if (Object.keys(body).length === 0) return json({ ok: true });
        if (env('BITESHIP_SYNC_ENABLED') !== 'true') throw new HttpError(503, 'Sync disabled.');
        env('BITESHIP_API_KEY');
        const db = new Database();
        await db.limit('shipment-webhook:global', 120);
        await webhookNotification(db, body);
        return json({ accepted: true });
    } catch (error) { return failure(error); }
}

export async function schedulerHandler(request: Request) {
    try {
        if (request.method !== 'POST') throw new HttpError(405, 'POST required.');
        const secret = env('BITESHIP_SYNC_SECRET');
        if (secret.length < 32 || request.headers.get('x-shipment-sync-secret') !== secret) throw new HttpError(401, 'Unauthorized.');
        if (env('BITESHIP_SYNC_ENABLED') !== 'true') throw new HttpError(503, 'Sync disabled.');
        env('BITESHIP_API_KEY');
        const db = new Database();
        await db.limit('shipment-scheduler:global', 1);
        const batch = await db.rpc<{ order_id: string }[]>('zyha_shipment_sync_batch', {});
        let synced = 0;
        // Bounded parallelism keeps 20 x 15-second provider timeouts below edge limits.
        for (let i = 0; i < batch.length; i += 4) {
            await Promise.all(batch.slice(i, i + 4).map(async row => {
                try { if ((await syncShipment(db, row.order_id)).synced) synced++; }
                catch { /* Claim failure records backoff; never log provider/customer data. */ }
            }));
        }
        return json({ checked: batch.length, synced });
    } catch (error) { return failure(error); }
}