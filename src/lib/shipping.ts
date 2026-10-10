import type { Order } from '../types';

function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[char]!);
}

export function buildPackingSlipHtml(order: Order): string {
    const weightSummary = order.total_weight_grams > 0 ? `${escapeHtml(order.total_weight_grams)} g total barang` : 'Berat barang belum dicatat';
    const itemRows = order.items.map(item => `<tr>
      <td>${escapeHtml(item.title)}${item.variant ? `<small>${escapeHtml(item.variant)}</small>` : ''}${item.weight_grams ? `<small>${escapeHtml(item.weight_grams)} g per item</small>` : ''}</td>
      <td class="number">${escapeHtml(item.quantity)}</td>
    </tr>`).join('');
    const address = [order.customer_address, order.customer_district, order.customer_city, order.customer_province, order.customer_postal_code]
        .filter(Boolean).map(escapeHtml).join('<br>');
    return `<!doctype html><html lang="id"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1"><title>Packing slip ${escapeHtml(order.order_number)}</title>
      <style>
        @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:14px/1.5 Arial,sans-serif;color:#17212b;margin:0}
        h1{font-size:22px;margin:0}h2{font-size:15px;margin:22px 0 6px}.muted,small{color:#586575}
        .head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #17212b;padding-bottom:14px}
        .notice{margin:14px 0;padding:9px 12px;background:#f2f4f6;border:1px solid #d7dce1;font-size:12px}
        .number{text-align:right}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 6px;border-bottom:1px solid #d7dce1}
        th:last-child,td:last-child{text-align:right}small{display:block}.meta{margin-top:12px}.print{margin-top:20px;padding:9px 14px}
        @media print{.print{display:none}}
      </style></head><body>
      <header class="head"><div><h1>Packing slip</h1><div class="muted">${escapeHtml(order.order_number)}</div></div>
      <div class="number"><strong>${escapeHtml(new Date(order.created_at).toLocaleString('id-ID'))}</strong><div>${weightSummary}</div></div></header>
      <p class="notice">Dokumen pengepakan internal. Ini bukan label pengiriman atau resi resmi kurir.</p>
      <h2>Penerima</h2><strong>${escapeHtml(order.customer_name)}</strong><div>${escapeHtml(order.customer_phone)}</div><div>${address}</div>
      ${order.customer_note ? `<p><strong>Catatan:</strong> ${escapeHtml(order.customer_note)}</p>` : ''}
      <h2>Isi paket</h2><table><thead><tr><th>Produk</th><th>Jumlah</th></tr></thead><tbody>${itemRows}</tbody></table>
      <div class="meta">Kurir: ${escapeHtml(order.carrier || 'Belum ditentukan')}<br>Resi: ${escapeHtml(order.tracking_number || 'Belum tersedia')}</div>
      <button class="print" id="print">Cetak packing slip</button></body></html>`;
}

export function printPackingSlip(order: Order): void {
    const printWindow = window.open('about:blank', '_blank');
    if (!printWindow)
        throw new Error('Jendela cetak diblokir browser. Izinkan pop-up untuk mencetak packing slip.');
    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(buildPackingSlipHtml(order));
    printWindow.document.close();
    printWindow.document.getElementById('print')?.addEventListener('click', () => printWindow.print());
    printWindow.focus();
    printWindow.print();
}
