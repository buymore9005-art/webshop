// This allowlisted DTO deliberately excludes provider metadata, links and financial totals.
export interface LabelContact {
    name: string; phone: string; address: string; postalCode: string; note: string;
}
export interface ShippingLabel {
    reference: string; waybill: string; routing: string; courier: string; service: string;
    sender: LabelContact; recipient: LabelContact; note: string; cod: number | null;
    items: { name: string; quantity: number | null; weight: number | null; length: number | null; width: number | null; height: number | null }[];
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown, max = 2000): string => typeof v === 'string' ? v.trim().slice(0, max) : '';
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
function contact(v: unknown): LabelContact {
    const r = record(v);
    return { name: text(r.contact_name, 200), phone: text(r.contact_phone, 80), address: text(r.address),
        postalCode: typeof r.postal_code === 'number' && Number.isSafeInteger(r.postal_code) ? String(r.postal_code) : text(r.postal_code, 20), note: text(r.note) };
}
export function normalizeShippingLabel(raw: Record<string, unknown>, id: string, reference: string): ShippingLabel {
    const order = raw.order === undefined ? raw : record(raw.order);
    if (raw.success !== true || order.id !== id ||
        (order.reference_id != null && order.reference_id !== reference))
        throw new Error('Respons Biteship tidak cocok dengan booking pesanan. Periksa dashboard Biteship.');
    const courier = record(order.courier);
    const waybill = text(courier.waybill_id, 200);
    if (!waybill || waybill !== courier.waybill_id || /[\u0000-\u001f\u007f]/.test(waybill))
        throw new Error('Nomor resi (waybill_id) belum tersedia. Tunggu penerbitan resi lalu coba lagi; jangan membuat booking baru.');
    const destination = record(order.destination);
    return {
        reference, waybill, routing: text(courier.routing_code, 200), courier: text(courier.company, 120), service: text(courier.type, 120),
        sender: contact(order.origin), recipient: contact(destination), note: text(order.note),
        cod: number(record(destination.cash_on_delivery).amount),
        items: Array.isArray(order.items) ? order.items.map(value => {
            const item = record(value);
            return { name: text(item.name, 200), quantity: number(item.quantity), weight: number(item.weight),
                length: number(item.length), width: number(item.width), height: number(item.height) };
        }) : [],
    };
}