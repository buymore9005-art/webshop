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
    const customer = {
        name: string(c.name, 'Nama', 2, 120),
        address: string(c.address, 'Alamat jalan', 10, 500),
        district: string(c.district, 'Kecamatan', 2, 100),
        city: string(c.city, 'Kota/Kabupaten', 2, 100),
        province: string(c.province, 'Provinsi', 2, 100),
        postal_code: string(c.postal_code, 'Kode pos', 5, 5),
        phone: string(c.phone, 'WhatsApp', 10, 15),
        note: string(c.note ?? '', 'Catatan', 0, 500),
    };
    if (!/^\d{5}$/.test(customer.postal_code))
        throw new HttpError(400, 'Kode pos tidak valid.');
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
