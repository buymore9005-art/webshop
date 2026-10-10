import { useState } from 'react';
import type { Customer, OrderAccess, Receipt, Settings } from '../types';
import { dateTime, errorMessage, fulfillmentLabels, money, orderLabels, whatsappUrl } from '../lib/domain';
import { downloadOrderAccessBackup, loadReceipt } from '../lib/api';
import { Message, Photo } from '../components/UI';
export function OrderReceipt({ initial, access, settings, customer, onBack }: {
  initial: Receipt;
  access: OrderAccess;
  settings: Settings;
  customer?: Customer;
  onBack: () => void;
}) {
  const [receipt, setReceipt] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function refresh() {
    setBusy(true); setError(''); try {
      setReceipt(await loadReceipt(access));
      setMessage('Status pesanan diperbarui dari server.');
    }
      catch (e) {
        setError(errorMessage(e));
      }
      finally {
        setBusy(false);
      }
  }
  const method = receipt.payment_snapshot;
  let wa = '';
  if (settings.admin_phone) {
    const text = [`PESANAN ${receipt.order_number}`, customer ? `Nama: ${customer.name}\nAlamat: ${customer.address}, ${customer.district}, ${customer.city}, ${customer.province} ${customer.postal_code}\nWhatsApp: ${customer.phone}` : '', ...receipt.items.map(x => `${x.title}${x.variant ? ' (' + x.variant + ')' : ''} × ${x.quantity}: ${money(x.subtotal)}`), `Ongkir: ${money(receipt.shipping_fee)}`, receipt.coupon_code ? `Kupon ${receipt.coupon_code}: -${money(receipt.discount_amount)}` : '', `Total: ${money(receipt.total_price)}`, `Metode: ${receipt.payment_method}`].filter(Boolean).join('\n');
    try {
      wa = whatsappUrl(settings.admin_phone, text);
    }
    catch { /* Admin settings enforce valid number. */ }
  }
  return <section className="container section receipt">
    <p className="eyebrow">Pesanan tersimpan</p>
    <h1>Terima kasih telah berbelanja</h1>
    <p className="order-reference">
      {receipt.order_number}
    </p>
    <p className="muted">
      {dateTime(receipt.created_at)} · Simpan nomor pesanan. Bukti akses tersedia pada tab ini, maksimal 30 hari.</p>
    <div className="checkout-grid">
      <section className="panel stack">
        <div className="split">
          <h2>Status pembayaran</h2>
          <span className={'status ' + receipt.status}>
            {orderLabels[receipt.status]}
          </span>
        </div>
        <p>Pengiriman: {fulfillmentLabels[receipt.fulfillment_status]}
        </p>
        {receipt.tracking_number && <p>Resi: <strong>
          {receipt.carrier} · {receipt.tracking_number}
        </strong>
        </p>}
        {receipt.status === 'pending' && <>
          <h3>
            {method.name}
          </h3>
          {method.type === 'QRIS' && method.qris_url ? <>
            <p>Bayar sesuai total pesanan, kemudian kirim konfirmasi ke Admin. Pesanan tidak otomatis dianggap lunas.</p>
            <Photo src={method.qris_url} alt={'QRIS ' + method.name} className="qris" />
            {wa ? <a className="button" href={wa} target="_blank" rel="noopener noreferrer">Kirim konfirmasi ke WhatsApp</a> : <p className="message">Nomor WhatsApp toko belum diatur. Simpan nomor pesanan dan hubungi toko melalui kanal yang tersedia.</p>}
          </> : method.type === 'Bank' || method.type === 'E-Wallet' ? <>
            <p>Transfer sesuai total pesanan, kemudian kirim konfirmasi ke Admin. Pesanan tidak otomatis dianggap lunas.</p>
            <p className="account-number">{method.account_number}</p>
            <p>Atas nama: <strong>{method.account_holder}</strong></p>
            {wa ? <a className="button" href={wa} target="_blank" rel="noopener noreferrer">Kirim konfirmasi ke WhatsApp</a> : <p className="message">Nomor WhatsApp toko belum diatur. Simpan nomor pesanan dan hubungi toko melalui kanal yang tersedia.</p>}
          </> : <p className="message">Instruksi pembayaran untuk pesanan ini tidak tersedia. Hubungi Admin untuk bantuan.</p>}
        </>}
        <Message error={error} success={message} />
        <div className="actions">
          <button className="button secondary" disabled={busy} onClick={refresh}>
            {busy ? 'Memeriksa…' : 'Periksa status'}
          </button>
          <button type="button" className="button secondary" onClick={() => downloadOrderAccessBackup(access, receipt.order_number)}>Unduh kunci pemulihan</button>
          <button className="button secondary" onClick={() => window.print()}>Cetak ringkasan</button>
        </div>
        <small>Simpan file kunci di tempat pribadi. File ini memberikan akses ke ringkasan pesanan; jangan bagikan atau unggah ke tempat umum.</small>
      </section>
      <aside className="panel stack">
        <h2>Detail pesanan</h2>
        {receipt.items.map((x, i) => <div className="split" key={i}>
          <span>
            {x.title}
            <small>
              {x.variant || 'Tanpa varian'} · {x.quantity} × {money(x.unit_price)}
            </small>
          </span>
          <strong>
            {money(x.subtotal)}
          </strong>
        </div>)}
        <div className="split border-top">
          <span>Subtotal</span>
          <span>
            {money(receipt.subtotal)}
          </span>
        </div>
        <div className="split">
          <span>Ongkos kirim</span>
          <span>
            {money(receipt.shipping_fee)}
          </span>
        </div>
        {receipt.coupon_code && <div className="split"><span>Diskon kupon ({receipt.coupon_code})</span><strong>−{money(receipt.discount_amount)}</strong></div>}
        <div className="split total">
          <span>Total final</span>
          <strong>
            {money(receipt.total_price)}
          </strong>
        </div>
        <small>Status lunas hanya berasal dari verifikasi pembayaran oleh Admin.</small>
      </aside>
    </div>
    <button type="button" className="button secondary" onClick={onBack}>Kembali ke katalog</button>
  </section>;
}
