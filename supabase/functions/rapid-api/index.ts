import { checkoutInput, uuid, proof, string, HttpError } from '../_shared/validation.ts';
import { cors, Database, env, failure, hash, json, readJson } from '../_shared/server.ts';
import { createOrder as createBiteshipOrder, getRates as getBiteshipRates, searchAreas } from '../_shared/biteship.ts';

interface RateCartItem {
    product_id: string;
    variant: string;
    quantity: number;
}

async function rateItems(db: Database, value: unknown) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 50)
        throw new HttpError(400, 'Keranjang tidak valid.');
    const seen = new Set<string>();
    const items: RateCartItem[] = value.map(entry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            throw new HttpError(400, 'Baris keranjang tidak valid.');
        const row = entry as Record<string, unknown>;
        const product_id = uuid(row.product_id);
        const variant = string(row.variant ?? '', 'Varian', 0, 100);
        if (typeof row.quantity !== 'number' || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 99)
            throw new HttpError(400, 'Jumlah harus 1–99.');
        const key = product_id + '|' + variant;
        if (seen.has(key))
            throw new HttpError(400, 'Baris keranjang duplikat.');
        seen.add(key);
        return { product_id, variant, quantity: row.quantity };
    });
    const ids = [...new Set(items.map(item => item.product_id))];
    const query = new URLSearchParams({
        select: 'id,title,description,category,price,weight_grams,length_cm,width_cm,height_cm,variants,is_active',
        id: 'in.(' + ids.join(',') + ')',
        is_active: 'eq.true',
    });
    const products = await db.request<Array<{
        id: string; title: string; description: string; category: string; price: number;
        weight_grams: number; length_cm: number; width_cm: number; height_cm: number;
        variants: { name: string }[]; is_active: boolean;
    }>>('products?' + query);
    const byId = new Map(products.map(product => [product.id, product]));
    let totalWeight = 0;
    let subtotal = 0;
    const parcelSnapshot = items.map(item => {
        const product = byId.get(item.product_id);
        if (!product || !product.is_active)
            throw new HttpError(400, 'Produk tidak tersedia.');
        if (product.variants.length ? !product.variants.some(variant => variant.name === item.variant) : item.variant !== '')
            throw new HttpError(400, 'Varian produk tidak valid.');
        if (!Number.isSafeInteger(product.weight_grams) || product.weight_grams < 1 ||
            ![product.length_cm, product.width_cm, product.height_cm].every(size => Number.isSafeInteger(size) && size > 0 && size <= 10000))
            throw new HttpError(400, `Berat dan dimensi produk "${product.title}" harus dilengkapi sebelum tarif dihitung.`);
        if (!Number.isSafeInteger(Number(product.price)) || Number(product.price) < 1 || Number(product.price) > 1000000000)
            throw new HttpError(400, 'Harga produk tidak valid untuk penghitungan tarif.');
        subtotal += Number(product.price) * item.quantity;
        if (!Number.isSafeInteger(subtotal) || subtotal > 1000000000)
            throw new HttpError(400, 'Subtotal keranjang melewati batas.');
        totalWeight += product.weight_grams * item.quantity;
        if (!Number.isSafeInteger(totalWeight) || totalWeight > 100000000)
            throw new HttpError(400, 'Berat total paket melewati batas.');
        return {
            product_id: item.product_id,
            variant: item.variant,
            name: (product.title + (item.variant ? ' - ' + item.variant : '')).slice(0, 200),
            description: String(product.description || '').slice(0, 500),
            category: String(product.category || '').slice(0, 100),
            value: Number(product.price),
            quantity: item.quantity,
            length: Number(product.length_cm),
            width: Number(product.width_cm),
            height: Number(product.height_cm),
            weight: Number(product.weight_grams),
        };
    });
    const parcels = parcelSnapshot.map(({ product_id: _productId, variant: _variant, ...parcel }) => parcel);
    return { parcels, parcelSnapshot, totalWeight, subtotal };
}

async function normalizedRates(db: Database, actor: string, body: Record<string, unknown>) {
    await db.limit('shipping-rates:' + actor, 12, 60);
    const settings = await db.row<{ shipping_provider: string; shipping_couriers: string }>('settings', {
        select: 'shipping_provider,shipping_couriers', id: 'eq.1',
    });
    if (!settings || settings.shipping_provider !== 'biteship')
        throw new HttpError(409, 'Tarif Biteship tidak sedang aktif.');
    if (!/^[a-z0-9,-]{1,200}$/.test(settings.shipping_couriers))
        throw new HttpError(503, 'Daftar kurir Biteship pada pengaturan tidak valid.');
    const origin = await db.row<{
        provider_location_id: string; name: string; phone: string; address: string; postal_code: string;
    }>('shipping_origin', { select: 'provider_location_id,name,phone,address,postal_code', id: 'eq.1' });
    if (!origin || !/^[a-z0-9_-]{3,120}$/i.test(origin.provider_location_id) ||
        !origin.name.trim() || !/^62\d{8,13}$/.test(origin.phone) ||
        origin.address.trim().length < 5 || !/^\d{5}$/.test(origin.postal_code))
        throw new HttpError(409, 'Lengkapi nama, telepon, alamat, kode pos, dan ID area gudang pada Pengaturan pengiriman.');
    const destinationAreaId = string(body.destinationAreaId, 'Area tujuan', 3, 120);
    if (!/^[a-z0-9_-]+$/i.test(destinationAreaId))
        throw new HttpError(400, 'Area tujuan tidak valid.');
    const destinationPostalCode = string(body.destinationPostalCode, 'Kode pos tujuan', 5, 5);
    if (!/^\d{5}$/.test(destinationPostalCode))
        throw new HttpError(400, 'Kode pos tujuan harus terdiri dari 5 angka.');
    const { parcels, parcelSnapshot, totalWeight, subtotal } = await rateItems(db, body.items);
    const response = await getBiteshipRates({
        origin_area_id: origin.provider_location_id,
        destination_area_id: destinationAreaId,
        couriers: settings.shipping_couriers,
        items: parcels,
    });
    if (!Array.isArray(response.pricing))
        throw new HttpError(502, 'Respons tarif Biteship tidak memiliki daftar layanan.');
    const quoteId = crypto.randomUUID();
    const rates = [];
    for (const [index, entry] of response.pricing.slice(0, 100).entries()) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            continue;
        const raw = entry as Record<string, unknown>;
        const courier = raw.courier && typeof raw.courier === 'object' && !Array.isArray(raw.courier)
            ? raw.courier as Record<string, unknown> : raw;
        const company = String(courier.company ?? courier.courier_company ?? raw.courier_company ?? raw.courier_code ?? '').trim();
        const serviceCode = String(courier.type ?? courier.courier_type ?? raw.courier_type ?? raw.courier_service_code ?? '').trim();
        const amount = Number(courier.amount ?? raw.price ?? raw.amount);
        const currency = String(courier.currency ?? 'IDR').toUpperCase();
        if (!/^[a-z0-9_-]{1,80}$/i.test(company) || !/^[a-z0-9_-]{1,100}$/i.test(serviceCode) ||
            !Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000 || currency !== 'IDR')
            continue;
        const key = await hash([quoteId, company, serviceCode, amount, index].join(':'));
        rates.push({
            key,
            courier_code: company,
            courier_name: String(courier.name ?? raw.courier_name ?? company).slice(0, 120),
            service_code: serviceCode,
            service_name: String(courier.service_name ?? raw.courier_service_name ?? raw.courier_type_name ?? serviceCode).slice(0, 120),
            amount,
            currency,
            estimated_days: String(courier.estimated_days ?? raw.estimated_days ?? courier.shipment_duration_range ?? raw.duration ?? '').slice(0, 40),
        });
    }
    if (!rates.length)
        throw new HttpError(404, 'Tidak ada layanan kurir yang tersedia untuk tujuan dan paket ini.');
    const expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString();
    await db.rpc('zyha_create_biteship_quote', {
        p_id: quoteId,
        p_origin: { area_id: origin.provider_location_id },
        p_destination: { area_id: destinationAreaId, postal_code: destinationPostalCode },
        p_weight: totalWeight,
        p_items: parcelSnapshot,
        p_services: rates,
        p_expires_at: expiresAt,
    });
    return { quote_id: quoteId, expires_at: expiresAt, subtotal, rates };
}

async function bookShipment(db: Database, request: Request, body: Record<string, unknown>) {
    const userId = await optionalCustomerId(request);
    if (!userId)
        throw new HttpError(401, 'Masuk sebagai Admin untuk membuat booking pengiriman.');
    const admin = await db.row<{ user_id: string }>('admin_users', {
        select: 'user_id', user_id: 'eq.' + userId, is_active: 'eq.true',
    });
    if (!admin)
        throw new HttpError(403, 'Akses Admin diperlukan.');
    const orderId = uuid(body.orderId);
    const prepared = await db.rpc<Record<string, unknown>>('zyha_begin_biteship_shipment', { p_order_id: orderId });
    if (prepared.already_booked) {
        const shipment = await db.row<Record<string, unknown>>('shipping_shipments', {
            select: '*', order_id: 'eq.' + orderId,
        });
        if (!shipment)
            throw new HttpError(503, 'Booking tercatat tetapi data shipment belum tersedia.');
        return { already_booked: true, shipment };
    }
    const order = prepared.order as Record<string, unknown>;
    const origin = prepared.origin as Record<string, unknown>;
    const quote = prepared.quote as Record<string, unknown>;
    const service = prepared.service as Record<string, unknown>;
    const parcels = quote.parcel_items;
    if (!Array.isArray(parcels) || !parcels.length)
        throw new HttpError(503, 'Snapshot paket untuk booking tidak tersedia.');
    try {
        const response = await createBiteshipOrder({
            reference_id: String(order.order_number),
            origin_contact_name: String(origin.name),
            origin_contact_phone: String(origin.phone),
            origin_address: [origin.address, origin.district, origin.city, origin.province].filter(Boolean).join(', '),
            origin_postal_code: Number(origin.postal_code),
            origin_area_id: String(origin.provider_location_id),
            destination_contact_name: String(order.customer_name),
            destination_contact_phone: String(order.customer_phone),
            destination_address: [order.customer_address, order.customer_district, order.customer_city, order.customer_province].filter(Boolean).join(', '),
            destination_postal_code: Number((quote.destination as Record<string, unknown>).postal_code),
            destination_area_id: String((quote.destination as Record<string, unknown>).area_id),
            destination_note: String(order.customer_note || ''),
            courier_company: String(service.courier_code),
            courier_type: String(service.service_code),
            delivery_type: 'now',
            order_note: 'Pesanan toko ' + String(order.order_number),
            metadata: { store_order_number: String(order.order_number), provider_request_id: String(prepared.provider_request_id) },
            items: parcels.map((entry: unknown) => {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry))
                    throw new HttpError(503, 'Snapshot item paket tidak valid.');
                const { product_id: _productId, variant: _variant, ...parcel } = entry as Record<string, unknown>;
                return parcel;
            }),
        });
        const providerOrder = response.order && typeof response.order === 'object'
            ? response.order as Record<string, unknown> : response;
        const courier = providerOrder.courier && typeof providerOrder.courier === 'object'
            ? providerOrder.courier as Record<string, unknown> : {};
        const providerId = String(providerOrder.id ?? providerOrder.order_id ?? '');
        if (!providerId)
            throw new HttpError(502, 'Biteship tidak mengembalikan ID booking. Periksa dashboard Biteship sebelum mengulangi.');
        const tracking = String(courier.waybill_id ?? providerOrder.waybill_id ?? courier.tracking_id ?? '').slice(0, 120);
        const label = String(providerOrder.label_url ?? courier.label_url ?? courier.link ?? '');
        const safeLabel = /^https:\/\//i.test(label) ? label.slice(0, 2048) : '';
        await db.rpc('zyha_complete_biteship_shipment', {
            p_order_id: orderId, p_provider_shipment_id: providerId,
            p_tracking_number: tracking, p_label_url: safeLabel, p_status: 'booked',
        });
    }
    catch (error) {
        await db.rpc('zyha_fail_biteship_shipment', {
            p_order_id: orderId,
            p_error: error instanceof Error ? error.message.slice(0, 500) : 'Booking provider gagal',
        });
        throw error;
    }
    const shipment = await db.row<Record<string, unknown>>('shipping_shipments', {
        select: '*', order_id: 'eq.' + orderId,
    });
    if (!shipment)
        throw new HttpError(503, 'Booking berhasil tetapi data shipment tidak dapat dimuat.');
    return { already_booked: false, shipment };
}

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
        if (action === 'shipping-areas') {
            await db.limit('shipping-areas:' + actor, 20, 60);
            return json({ areas: await searchAreas(body.input) }, 200, headers);
        }
        if (action === 'shipping-rates')
            return json(await normalizedRates(db, actor, body), 200, headers);
        if (action === 'book-biteship-shipment')
            return json(await bookShipment(db, request, body), 200, headers);
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
            const shippingQuoteId = typeof body.shippingQuoteId === 'string' && body.shippingQuoteId ? uuid(body.shippingQuoteId) : '';
            const shippingServiceKey = typeof body.shippingServiceKey === 'string' ? body.shippingServiceKey : '';
            const shippingAreaId = typeof body.shippingAreaId === 'string' ? body.shippingAreaId.trim() : '';
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
            const settings = await db.row<{ shipping_provider: string }>('settings', { select: 'shipping_provider', id: 'eq.1' });
            const requestHash = await hash(JSON.stringify({ ...data, couponCode, shippingQuoteId, shippingServiceKey, shippingAreaId }));
            if (settings?.shipping_provider === 'biteship') {
                if (!shippingQuoteId || !/^[a-f0-9]{64}$/.test(shippingServiceKey) || !/^[a-z0-9_-]{3,120}$/i.test(shippingAreaId))
                    throw new HttpError(400, 'Pilih layanan tarif Biteship yang masih berlaku.');
                await db.rpc('zyha_place_order_with_biteship', {
                    p_request_id: requestId, p_receipt_token: token, p_request_hash: requestHash,
                    p_items: data.items, p_customer: { ...data.customer, destination_area_id: shippingAreaId },
                    p_method_id: data.methodId, p_coupon_code: couponCode, p_customer_key: customerKey,
                    p_quote_id: shippingQuoteId, p_service_key: shippingServiceKey,
                });
            }
            else {
                if (shippingQuoteId || shippingServiceKey)
                    throw new HttpError(409, 'Mode ongkir berubah. Muat ulang checkout dan hitung kembali tarif.');
                await db.rpc('zyha_place_order_with_coupon', {
                    p_request_id: requestId, p_receipt_token: token,
                    p_request_hash: requestHash,
                    p_items: data.items, p_customer: data.customer, p_method_id: data.methodId,
                    p_coupon_code: couponCode, p_customer_key: customerKey,
                });
            }
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
