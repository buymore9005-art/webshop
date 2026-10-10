import type { CartLine, CheckoutItem, Customer, Product, OrderAccess, OrderStatus, FulfillmentStatus } from '../types';
export const MAX_LINES = 50;
export const MAX_QUANTITY = 99;
export const MAX_MONEY = 1000000000;
export function money(value: number | null | undefined): string {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
export function dateTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
}
export function safeImageUrl(value: unknown): string {
    if (typeof value !== 'string' || value.length > 2048)
        return '';
    try {
        const u = new URL(value);
        return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
    }
    catch {
        return '';
    }
}
export function normalizePhone(value: string): string {
    if (!/^[\d\s+()-]+$/.test(value))
        throw new Error('Nomor WhatsApp tidak valid.');
    let phone = value.replace(/\D/g, '');
    if (phone.startsWith('0'))
        phone = '62' + phone.slice(1);
    else if (phone.startsWith('8'))
        phone = '62' + phone;
    if (!/^62\d{8,13}$/.test(phone))
        throw new Error('Gunakan nomor WhatsApp Indonesia yang valid (08… atau 62…).');
    return phone;
}
export function quantity(value: number): number {
    if (!Number.isInteger(value) || value < 1 || value > MAX_QUANTITY)
        throw new Error('Jumlah harus berupa bilangan bulat 1–99.');
    return value;
}
export function addCartLine(cart: CartLine[], product: Product, variant: string, count = 1): CartLine[] {
    quantity(count);
    if (!product.is_active)
        throw new Error('Produk sudah tidak tersedia.');
    if (product.variants.length && !product.variants.some(v => v.name === variant))
        throw new Error('Pilih varian produk terlebih dahulu.');
    if (!product.variants.length && variant)
        throw new Error('Varian tidak valid.');
    const total = cart.filter(x => x.product_id === product.id).reduce((s, x) => s + x.quantity, 0) + count;
    if (product.stock !== null && total > product.stock)
        throw new Error('Jumlah melebihi stok yang tersedia.');
    const found = cart.find(x => x.product_id === product.id && x.variant === variant);
    if (found)
        return cart.map(x => x === found ? { ...x, quantity: quantity(x.quantity + count) } : x);
    if (cart.length >= MAX_LINES)
        throw new Error('Maksimal 50 baris produk dalam satu pesanan.');
    return [...cart, { product_id: product.id, variant, quantity: count, title: product.title, price: product.price, image: safeImageUrl(product.variants.find(v => v.name === variant)?.image || product.image_url || product.images[0]) }];
}
export function setCartQuantity(cart: CartLine[], id: string, variant: string, count: number): CartLine[] {
    quantity(count);
    return cart.map(x => x.product_id === id && x.variant === variant ? { ...x, quantity: count } : x);
}
export function checkoutItems(cart: CartLine[]): CheckoutItem[] {
    if (!cart.length || cart.length > MAX_LINES)
        throw new Error('Keranjang kosong atau terlalu banyak produk.');
    return cart.map(x => ({ product_id: x.product_id, variant: x.variant, quantity: quantity(x.quantity) }));
}
export function cartTotals(cart: CartLine[], fee = 0, freeMinimum: number | null = null) {
    const subtotal = cart.reduce((sum, x) => sum + x.price * x.quantity, 0);
    const shipping = subtotal > 0 && (freeMinimum === null || subtotal < freeMinimum) ? fee : 0;
    return { subtotal, shipping, total: subtotal + shipping };
}
export function parseCart(raw: string | null): CartLine[] {
    try {
        const data: unknown = JSON.parse(raw || '[]');
        if (!Array.isArray(data) || data.length > MAX_LINES)
            return [];
        const seen = new Set<string>();
        return data.filter((x): x is CartLine => {
            if (!x || typeof x !== 'object' || typeof x.product_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.product_id) || typeof x.variant !== 'string' || x.variant.length > 100 || typeof x.title !== 'string' || x.title.length > 200 || !Number.isInteger(x.price) || x.price <= 0 || x.price > MAX_MONEY || !Number.isInteger(x.quantity) || x.quantity < 1 || x.quantity > MAX_QUANTITY)
                return false;
            const k = x.product_id + '|' + x.variant;
            if (seen.has(k))
                return false;
            seen.add(k);
            return true;
        }).map(x => ({ ...x, image: safeImageUrl(x.image) }));
    }
    catch {
        return [];
    }
}
export function parseOrderAccessBackup(raw: string): OrderAccess {
    let data: unknown;
    try {
        data = JSON.parse(raw);
    }
    catch {
        throw new Error('File kunci pemulihan bukan JSON yang valid.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('Format kunci pemulihan tidak valid.');
    const backup = data as Record<string, unknown>;
    if (backup.format !== 'zyha-order-access' || backup.version !== 1 ||
        typeof backup.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(backup.requestId) ||
        typeof backup.receiptToken !== 'string' || !/^[0-9a-f]{64}$/.test(backup.receiptToken) ||
        typeof backup.signature !== 'string' || !/^[0-9a-f]{64}$/.test(backup.signature) ||
        typeof backup.orderNumber !== 'string' || !/^ZYHA-[A-F0-9]{32}$/.test(backup.orderNumber))
        throw new Error('Isi file kunci pemulihan tidak lengkap atau tidak dikenali.');
    return {
        requestId: backup.requestId.toLowerCase(),
        receiptToken: backup.receiptToken,
        signature: backup.signature,
    };
}
export function serializeOrderAccessBackup(access: OrderAccess, orderNumber: string): string {
    const backup = {
        format: 'zyha-order-access',
        version: 1,
        orderNumber,
        requestId: access.requestId,
        receiptToken: access.receiptToken,
        signature: access.signature,
    };
    const contents = JSON.stringify(backup, null, 2);
    parseOrderAccessBackup(contents);
    return contents;
}
export function articleSlug(value: string): string {
    const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120).replace(/-+$/g, '');
    if (slug.length < 3)
        throw new Error('Slug artikel minimal 3 karakter dan hanya boleh berisi huruf, angka, dan tanda hubung.');
    return slug;
}
export function safeFooterHref(value: string): string {
    const href = value.trim();
    if (!href)
        return '';
    if (href.length > 2048 || href.startsWith('//') || href.startsWith('/\\') || /[\u0000-\u001f\u007f]/.test(href))
        throw new Error('Tautan footer tidak valid.');
    if (href.startsWith('/'))
        return href;
    try {
        const url = new URL(href);
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password)
            throw new Error();
        return url.href;
    }
    catch {
        throw new Error('Tautan footer harus berupa HTTPS atau path internal toko.');
    }
}
export function validateCustomer(value: Customer): Customer {
    const customer = {
        name: value.name.trim(), address: value.address.trim(), district: value.district.trim(),
        city: value.city.trim(), province: value.province.trim(), postal_code: value.postal_code.trim(),
        phone: normalizePhone(value.phone), note: value.note.trim(),
    };
    if (customer.name.length < 2 || customer.name.length > 120)
        throw new Error('Nama harus berisi 2–120 karakter.');
    if (customer.address.length < 10 || customer.address.length > 500)
        throw new Error('Alamat jalan harus berisi 10–500 karakter.');
    for (const [value, label] of [[customer.district, 'Kecamatan'], [customer.city, 'Kota/Kabupaten'], [customer.province, 'Provinsi']] as const) {
        if (value.length < 2 || value.length > 100)
            throw new Error(`${label} harus berisi 2–100 karakter.`);
    }
    if (!/^\d{5}$/.test(customer.postal_code))
        throw new Error('Kode pos harus terdiri dari 5 angka.');
    if (customer.note.length > 500)
        throw new Error('Catatan maksimal 500 karakter.');
    return customer;
}
export function whatsappUrl(phone: string, message: string): string {
    return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}
export function csvCell(value: unknown): string {
    let s = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(s))
        s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
}
export interface ProductImportRow {
    title: string;
    price: number;
    description: string;
    category: string;
    image_url: string;
    stock: number | null;
    weight_grams: number;
    is_active: boolean;
}
export function parseProductCsv(raw: string): ProductImportRow[] {
    const rows: string[][] = [];
    let row: string[] = [], cell = '', quoted = false, afterQuote = false;
    const text = raw.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            }
            else if (char === '"')
                quoted = false, afterQuote = true;
            else
                cell += char;
            continue;
        }
        if (afterQuote && char !== ',' && char !== '\n' && char !== '\r' && char !== ' ' && char !== '\t')
            throw new Error('Format CSV tidak valid: ada karakter setelah tanda kutip penutup.');
        if (char === '"') {
            if (cell.length || afterQuote)
                throw new Error('Format CSV tidak valid: tanda kutip harus mengapit seluruh isi kolom.');
            quoted = true;
        }
        else if (char === ',') {
            row.push(cell.trim());
            cell = '';
            afterQuote = false;
        }
        else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n')
                i++;
            row.push(cell.trim());
            if (row.some(value => value !== ''))
                rows.push(row);
            row = [];
            cell = '';
            afterQuote = false;
        }
        else {
            cell += char;
        }
    }
    if (quoted)
        throw new Error('Format CSV tidak valid: ada tanda kutip yang belum ditutup.');
    row.push(cell.trim());
    if (row.some(value => value !== ''))
        rows.push(row);
    if (rows.length < 2)
        throw new Error('CSV harus berisi header dan minimal satu baris produk.');
    if (rows.length > 251)
        throw new Error('Maksimal 250 produk per impor.');
    const allowed = ['title', 'price', 'description', 'category', 'image_url', 'stock', 'weight_grams', 'is_active'];
    const headers = rows[0].map(value => value.toLowerCase());
    if (new Set(headers).size !== headers.length || headers.some(header => !allowed.includes(header)) || !headers.includes('title') || !headers.includes('price'))
        throw new Error('Header wajib: title,price. Header opsional: description,category,image_url,stock,is_active. Jangan gunakan header lain atau duplikat.');
    const index = (name: string) => headers.indexOf(name);
    return rows.slice(1).map((values, rowIndex) => {
        if (values.length !== headers.length)
            throw new Error(`Baris ${rowIndex + 2}: jumlah kolom tidak sesuai header.`);
        const get = (name: string) => index(name) < 0 ? '' : values[index(name)];
        const title = get('title'), rawPrice = get('price'), description = get('description');
        const category = get('category'), imageUrl = get('image_url'), rawStock = get('stock'), rawWeight = get('weight_grams'), rawActive = get('is_active');
        const price = Number(rawPrice), stock = rawStock === '' ? null : Number(rawStock), weight_grams = rawWeight === '' ? 0 : Number(rawWeight);
        if (title.length < 1 || title.length > 200 || !/^\d+$/.test(rawPrice) || !Number.isSafeInteger(price) || price < 1 || price > MAX_MONEY)
            throw new Error(`Baris ${rowIndex + 2}: nama produk dan harga bilangan bulat 1–${MAX_MONEY} wajib valid.`);
        if (description.length > 10000 || category.length > 100)
            throw new Error(`Baris ${rowIndex + 2}: deskripsi maksimal 10.000 karakter dan kategori maksimal 100 karakter.`);
        if (imageUrl && !safeImageUrl(imageUrl))
            throw new Error(`Baris ${rowIndex + 2}: image_url harus berupa URL HTTPS yang valid.`);
        if (rawStock !== '' && (!/^\d+$/.test(rawStock) || !Number.isSafeInteger(stock) || (stock as number) > 100000000))
            throw new Error(`Baris ${rowIndex + 2}: stock harus kosong atau bilangan bulat 0–100.000.000.`);
        if (rawWeight !== '' && (!/^\d+$/.test(rawWeight) || !Number.isSafeInteger(weight_grams) || weight_grams < 0 || weight_grams > 100000000))
            throw new Error(`Baris ${rowIndex + 2}: weight_grams harus kosong atau bilangan bulat 0–100.000.000.`);
        if (rawActive && !['true', 'false'].includes(rawActive.toLowerCase()))
            throw new Error(`Baris ${rowIndex + 2}: is_active harus true atau false.`);
        return { title, price, description, category, image_url: safeImageUrl(imageUrl), stock, weight_grams, is_active: rawActive ? rawActive.toLowerCase() === 'true' : true };
    });
}
export const orderLabels: Record<OrderStatus, string> = { pending: 'Menunggu pembayaran', paid: 'Lunas', cancelled: 'Dibatalkan', expired: 'Kedaluwarsa', failed: 'Gagal', refunded: 'Dikembalikan', partial_refund: 'Pengembalian sebagian' };
export const fulfillmentLabels: Record<FulfillmentStatus, string> = { unfulfilled: 'Belum diproses', processing: 'Diproses', shipped: 'Dikirim', completed: 'Selesai' };
export function errorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error)
        return String(error.message);
    return typeof error === 'string' ? error : 'Terjadi kesalahan. Coba kembali.';
}
