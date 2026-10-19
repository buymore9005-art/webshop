import type { LabelContact, ShippingLabel } from '../../supabase/functions/_shared/shippingLabel';
import JsBarcode from 'jsbarcode';
export type { ShippingLabel };
const escape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const shown = (value: unknown) => value === null || value === '' || value === undefined ? '-' : escape(value);

// Consume only the encoder's binary modules, never library-generated markup or text.
export function labelBarcode(value: string, widthMm: number, heightMm: number): string {
    const unavailable = '<div class="barcode-fallback">Barcode tidak tersedia / terlalu panjang. Gunakan label dashboard Biteship untuk pemindaian.</div>';
    if (!value || value.length > 200 || !/^[\x20-\x7e]+$/.test(value)) return unavailable;
    const target = {} as { encodings?: { data: string }[] };
    try { JsBarcode(target, value, { format: 'CODE128', displayValue: false, margin: 0 }); }
    catch { return unavailable; }
    const bits = target.encodings?.map(part => part.data).join('') ?? '';
    // Ten-module quiet zones and a minimum 0.25 mm module; never squash long IDs.
    if (!/^[01]+$/.test(bits) || (bits.length + 20) * 0.25 > widthMm) return unavailable;
    const modules = bits.length + 20;
    const rects = [...bits.matchAll(/1+/g)].map(match => `<rect x="${match.index! + 10}" y="0" width="${match[0].length}" height="${heightMm}"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barcode CODE128" width="${modules * 0.25}mm" height="${heightMm}mm" viewBox="0 0 ${modules} ${heightMm}" preserveAspectRatio="none"><g fill="black">${rects}</g></svg>`;
}

const amount = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? escape(value.toLocaleString('id-ID')) : '-';

export function shippingLabelHtml(label: ShippingLabel): string {
    if (typeof label.waybill !== 'string' || !label.waybill.trim())
        throw new Error('Nomor resi (waybill_id) belum tersedia. Label tidak dapat dicetak.');
    const contact = (title: string, c: LabelContact) => `<section><b>${title}</b><strong>${shown(c.name)}</strong><div>${shown(c.phone)}</div><div class="address">${shown(c.address)}</div><div>Kode pos: ${shown(c.postalCode)}</div></section>`;
    const quantity = label.items.length > 0 && label.items.every(i => i.quantity !== null) ? label.items.reduce((sum, i) => sum + i.quantity!, 0) : null;
    const weight = label.items.length > 0 && label.items.every(i => i.quantity !== null && i.weight !== null) ? label.items.reduce((sum, i) => sum + i.quantity! * i.weight!, 0) : null;
    const carrier = label.courier.toLowerCase() === 'jnt' ? 'J&T Express' : label.courier;
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Label resi</title><style>
@page{size:100mm 150mm;margin:4mm}*{box-sizing:border-box}body{margin:0;color:#000;background:#fff;font:10px/1.3 sans-serif}.label{width:92mm;border:1px solid #000;box-decoration-break:clone;-webkit-box-decoration-break:clone}header,section,footer{padding:2mm;border-bottom:1px solid #000}header{display:grid;grid-template-columns:1fr 2fr 1fr;align-items:center;min-height:13mm;gap:1mm}header .carrier{font-size:14px;font-weight:900}header .brand{text-align:center;font-size:30px;font-weight:800;letter-spacing:-1px}strong{display:block;font-size:12px}.awb,.service{text-align:center}.awb{break-inside:avoid}.awb strong{font-size:14px;margin-top:1mm}svg{display:block;margin:auto;max-width:100%}.service strong{font-size:16px}.routing{display:flex;justify-content:space-around;gap:2mm;margin-top:1mm}.metadata,.contacts{display:flex;align-items:stretch}.metadata>section,.contacts>section{width:50%;min-width:0}.metadata>section:first-child,.contacts>section:first-child{border-right:1px solid #000}.reference{text-align:center;break-inside:avoid}.reference svg{margin:1mm auto}.address{white-space:pre-wrap}div,td,strong,section{overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:9px}td,th{text-align:left;padding:1mm;border-bottom:1px solid #ccc}tr{break-inside:avoid}thead{display:table-header-group}footer{border:0;font-size:9px;text-align:center;break-inside:avoid}.cod{font-weight:bold}.barcode-fallback{font-size:9px;font-weight:normal}.controls{margin:10px;font-size:12px}@media print{.controls{display:none}}
</style></head><body><p class="controls">Template toko dari data Biteship, bukan label resmi/tersertifikasi kurir. Cetak pada 100 x 150 mm, skala 100%, tanpa header/footer browser. Isi panjang berlanjut ke halaman berikutnya; periksa pratinjau sebelum mencetak. Tutup tab setelah selesai.</p><main class="label">
<header><div class="carrier">${shown(carrier)}</div><div class="brand">Biteship</div><div></div></header>
<section class="awb">${labelBarcode(label.waybill, 86, 15)}<strong>Nomor Resi - ${escape(label.waybill)}</strong></section>
<section class="service">Ongkos Kirim<strong>Rp ${amount(label.shippingFee)}</strong><div class="routing"><div>Jenis Layanan<strong>${shown(label.service)}</strong></div><div>Kode Rute<strong>${shown(label.routing)}</strong></div></div>${label.cod !== null ? `<div class="cod">COD: Rp ${amount(label.cod)}</div>` : ''}</section>
<div class="metadata"><section class="reference"><b>Reference Number</b>${labelBarcode(label.reference, 40, 10)}<div>${escape(label.reference)}</div><small>Referensi internal (bukan resi)</small></section><section>Quantity<strong>${amount(quantity || quantity === 0 ? quantity : null)}</strong>Weight (total barang)<strong>${amount(weight || weight === 0 ? weight : null)} g</strong></section></div>
<div class="contacts">${contact('PENERIMA', label.recipient)}${contact('PENGIRIM', label.sender)}</div>
<section><b>Jenis Barang</b><table><thead><tr><th>Barang</th><th>Qty</th><th>g/unit</th><th>P x L x T (cm/unit)</th></tr></thead><tbody>${label.items.map(item => `<tr><td>${shown(item.name)}</td><td>${shown(item.quantity)}</td><td>${shown(item.weight)}</td><td>${shown(item.length)} x ${shown(item.width)} x ${shown(item.height)}</td></tr>`).join('')}</tbody></table></section>
<section class="address"><b>CATATAN</b><div>${shown(label.recipient.note)}</div>${label.sender.note ? `<div>Pengirim: ${escape(label.sender.note)}</div>` : ''}${label.note ? `<div>${escape(label.note)}</div>` : ''}</section>
<footer>Pengiriman melalui platform <b>Biteship</b><br>biteship.com<br><small>Template toko - bukan label resmi/tersertifikasi kurir.</small></footer></main></body></html>`;
}

// Open before awaiting the network so browsers retain the user's popup permission.
export async function printShippingLabel(load: () => Promise<ShippingLabel>): Promise<void> {
    const popup = window.open('', '_blank');
    if (!popup) throw new Error('Izinkan pop-up untuk mencetak label resi.');
    popup.opener = null;
    popup.document.body.textContent = 'Memuat label resi...';
    try {
        const html = shippingLabelHtml(await load());
        if (popup.closed) throw new Error('Jendela label ditutup. Silakan coba lagi.');
        popup.document.open(); popup.document.write(html); popup.document.close();
        // Wait for layout; never silently clip a long address or item list to the stock.
        await new Promise<void>(resolve => popup.requestAnimationFrame(() => resolve()));
        popup.onafterprint = () => popup.close();
        popup.focus(); popup.print();
    }
    catch (error) { popup.close(); throw error; }
}