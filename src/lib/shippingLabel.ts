import type { LabelContact, ShippingLabel } from '../../supabase/functions/_shared/shippingLabel';
export type { ShippingLabel };
const escape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const shown = (value: unknown) => value === null || value === '' || value === undefined ? '-' : escape(value);

export function shippingLabelHtml(label: ShippingLabel): string {
    if (typeof label.waybill !== 'string' || !label.waybill.trim())
        throw new Error('Nomor resi (waybill_id) belum tersedia. Label tidak dapat dicetak.');
    const contact = (title: string, c: LabelContact) => `<section><b>${title}</b><strong>${shown(c.name)}</strong><div>${shown(c.phone)}</div><div class="address">${shown(c.address)}</div><div>Kode pos: ${shown(c.postalCode)}</div></section>`;
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Label resi</title><style>
@page{size:100mm 150mm;margin:4mm}*{box-sizing:border-box}body{margin:0;color:#000;background:#fff;font:10px/1.3 sans-serif}.label{width:92mm;border:1px solid #000}header,section,footer{padding:2mm;border-bottom:1px solid #000}header{display:flex;justify-content:space-between;gap:2mm}strong{display:block;font-size:13px}h1{font-size:20px;margin:1mm 0;overflow-wrap:anywhere}.routing{font-size:18px;font-weight:bold}.contacts{display:grid;grid-template-columns:1fr 1fr}.contacts section:first-child{border-right:1px solid #000}.address{white-space:pre-wrap}div,td{overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:9px}td,th{text-align:left;padding:1mm;border-bottom:1px solid #ccc}tr{break-inside:avoid}footer{border:0;font-size:8px}.cod{font-size:15px;font-weight:bold}.controls{margin:10px;font-size:12px}@media print{.controls{display:none}}
</style></head><body><p class="controls">Label toko dari data Biteship. Cetak pada 100 x 150 mm, skala 100%, tanpa header/footer browser. Tutup tab setelah selesai.</p><main class="label">
<header><div><strong>${shown(label.courier)}</strong>Layanan: ${shown(label.service)}</div><div class="routing">${shown(label.routing)}</div></header>
<section><b>NOMOR RESI / AWB</b><h1>${escape(label.waybill)}</h1></section>
<div class="contacts">${contact('PENERIMA', label.recipient)}${contact('PENGIRIM', label.sender)}</div>
${label.cod !== null ? `<section class="cod">COD: Rp ${shown(label.cod)}</section>` : ''}
<section><b>ISI PAKET</b><table><thead><tr><th>Barang</th><th>Qty</th><th>g/unit</th><th>P x L x T (cm/unit)</th></tr></thead><tbody>${label.items.map(item => `<tr><td>${shown(item.name)}</td><td>${shown(item.quantity)}</td><td>${shown(item.weight)}</td><td>${shown(item.length)} x ${shown(item.width)} x ${shown(item.height)}</td></tr>`).join('')}</tbody></table></section>
<section class="address"><b>CATATAN</b><div>${shown(label.recipient.note)}</div>${label.sender.note ? `<div>Pengirim: ${escape(label.sender.note)}</div>` : ''}${label.note ? `<div>${escape(label.note)}</div>` : ''}</section>
<footer>Referensi internal (bukan resi): ${escape(label.reference)}<br>Label toko dari data Biteship - bukan PDF resmi kurir.</footer></main></body></html>`;
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
        const label = popup.document.querySelector('.label');
        if (label && label.getBoundingClientRect().height > 142 * 96 / 25.4)
            throw new Error('Isi label melebihi kertas 100 x 150 mm. Gunakan label dashboard Biteship; data tidak dipotong.');
        popup.onafterprint = () => popup.close();
        popup.focus(); popup.print();
    }
    catch (error) { popup.close(); throw error; }
}