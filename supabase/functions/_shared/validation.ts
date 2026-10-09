export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new HttpError(400, 'Format permintaan tidak valid.');
    return value as Record<string, unknown>;
}
export function string(value: unknown, name: string, min = 1, max = 200): string {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
        throw new HttpError(400, `${name} tidak valid.`);
    return value.trim();
}
export function uuid(value: unknown): string {
    const id = string(value, 'ID', 36, 36);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        throw new HttpError(400, 'ID tidak valid.');
    return id.toLowerCase();
}
export function proof(value: unknown): string {
    const text = string(value, 'Bukti akses', 64, 64);
    if (!/^[a-f0-9]{64}$/.test(text))
        throw new HttpError(400, 'Bukti akses tidak valid.');
    return text;
}
export function checkoutInput(body: Record<string, unknown>) {
    const c = object(body.customer);
    const customer = { name: string(c.name, 'Nama', 2, 120), address: string(c.address, 'Alamat', 10, 1000), phone: string(c.phone, 'WhatsApp', 10, 15), note: string(c.note ?? '', 'Catatan', 0, 500) };
    if (!/^62\d{8,13}$/.test(customer.phone))
        throw new HttpError(400, 'Nomor WhatsApp tidak valid.');
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50)
        throw new HttpError(400, 'Keranjang tidak valid.');
    const seen = new Set<string>();
    const items = body.items.map(v => {
        const i = object(v);
        const product_id = uuid(i.product_id);
        const variant = string(i.variant ?? '', 'Varian', 0, 100);
        if (typeof i.quantity !== 'number' || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99)
            throw new HttpError(400, 'Jumlah harus 1–99.');
        const key = product_id + '|' + variant;
        if (seen.has(key))
            throw new HttpError(400, 'Baris keranjang duplikat.');
        seen.add(key);
        return { product_id, variant, quantity: i.quantity };
    });
    return { customer, items, methodId: uuid(body.methodId) };
}
export type GatewayStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed' | 'refunded' | 'partial_refund';
export function gatewayStatus(data: Record<string, unknown>): GatewayStatus {
    const status = data.transaction_status;
    if (data.status_code === '200' && (status === 'settlement' || (status === 'capture' && data.fraud_status === 'accept')) && (!data.fraud_status || data.fraud_status === 'accept'))
        return 'paid';
    if (status === 'refund')
        return 'refunded';
    if (status === 'partial_refund')
        return 'partial_refund';
    if (status === 'cancel')
        return 'cancelled';
    if (status === 'expire')
        return 'expired';
    if (status === 'deny' || status === 'failure')
        return 'failed';
    return 'pending';
}
export function equalHex(a: string, b: string): boolean {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
export function integerMoney(value: unknown): number {
    const raw = String(value ?? '');
    if (!/^\d+(\.0{1,2})?$/.test(raw))
        throw new HttpError(400, 'Nominal pembayaran tidak valid.');
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0 || n > 1000000000)
        throw new HttpError(400, 'Nominal pembayaran tidak valid.');
    return n;
}
export function verifyGatewayData(data: Record<string, unknown>, orderId: string, amount: number): void {
    if (data.order_id !== orderId || (data.currency != null && data.currency !== 'IDR') || integerMoney(data.gross_amount) !== amount || typeof data.transaction_id !== 'string' || !data.transaction_id)
        throw new HttpError(409, 'Nominal/identitas pembayaran tidak cocok. Hubungi Admin.');
}

/** Build provider data only from the database order snapshot, never cart prices. */
export function buildSnapPayload(order: {
  id: string;
  gateway_order_id: string;
  total_price: number;
  shipping_fee: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  items: Array<{product_id: string; title: string; unit_price: number; quantity: number}>;
}) {
  const clip = (value: string, size: number) => Array.from(value).slice(0, size).join('');
  const total = integerMoney(order.total_price);
  const shipping = integerMoney(order.shipping_fee);
  const item_details = order.items.map((item, index) => ({
    id: item.product_id + '-' + index,
    name: clip(item.title.replace(/\|/g, ' '), 50),
    price: integerMoney(item.unit_price),
    quantity: item.quantity,
  }));
  if (shipping > 0) item_details.push({id: 'shipping', name: 'Ongkos kirim', price: shipping, quantity: 1});
  if (total <= 0 || item_details.some(item => !Number.isInteger(item.quantity) || item.quantity < 1) || item_details.reduce((sum, item) => sum + item.price * item.quantity, 0) !== total) {
    throw new HttpError(409, 'Nominal pesanan server tidak konsisten. Hubungi Admin.');
  }
  const payload = {
    transaction_details: {order_id: order.gateway_order_id, gross_amount: total},
    item_details,
    credit_card: {secure: true},
    customer_details: {
      first_name: clip(order.customer_name, 255),
      phone: order.customer_phone,
      shipping_address: {
        first_name: clip(order.customer_name, 255),
        phone: order.customer_phone,
        address: clip(order.customer_address, 255),
        country_code: 'IDN',
      },
    },
  };
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 15000) {
    payload.item_details = [{id: order.id, name: 'Produk pada pesanan ZYHA ID', price: total - shipping, quantity: 1}];
    if (shipping > 0) payload.item_details.push({id: 'shipping', name: 'Ongkos kirim', price: shipping, quantity: 1});
  }
  return payload;
}
