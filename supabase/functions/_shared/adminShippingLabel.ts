import { HttpError, uuid } from './validation.ts';
import { normalizeShippingLabel } from './shippingLabel.ts';
import type { Database } from './server.ts';

export async function adminShippingLabel(db: Pick<Database, 'row' | 'limit'>, request: Request, input: unknown,
    authenticate: (request: Request) => Promise<string | null>, getOrder: (id: string) => Promise<Record<string, unknown>>) {
    const userId = await authenticate(request);
    if (!userId) throw new HttpError(401, 'Masuk sebagai Admin untuk mencetak label.');
    const admin = await db.row('admin_users', { select: 'user_id', user_id: 'eq.' + userId, is_active: 'eq.true' });
    if (!admin) throw new HttpError(403, 'Akses Admin diperlukan.');
    const orderId = uuid(input);
    await db.limit('shipping-label:' + userId, 20, 60);
    const shipment = await db.row<{ provider_shipment_id: string; status: string }>('shipping_shipments', {
        select: 'provider_shipment_id,status', order_id: 'eq.' + orderId,
    });
    if (!shipment || !['booked', 'picked_up', 'in_transit', 'delivered'].includes(shipment.status) ||
        typeof shipment.provider_shipment_id !== 'string' || !shipment.provider_shipment_id.trim())
        throw new HttpError(409, 'Booking pengiriman belum siap untuk label. Periksa status booking di dashboard Biteship.');
    const order = await db.row<{ order_number: string }>('orders', { select: 'order_number', id: 'eq.' + orderId });
    if (!order) throw new HttpError(404, 'Pesanan tidak ditemukan.');
    const response = await getOrder(shipment.provider_shipment_id);
    try { return normalizeShippingLabel(response, shipment.provider_shipment_id, order.order_number); }
    catch (error) { throw new HttpError(409, error instanceof Error ? error.message : 'Label tidak tersedia.'); }
}