import { useState } from 'react';
import type { Customer, OrderAccess, Receipt, Settings } from '../types';
import { dateTime, errorMessage, fulfillmentLabels, money, orderLabels, whatsappUrl } from '../lib/domain';
import { loadReceipt, shopAction } from '../lib/api';
import { Message, Photo } from '../components/UI';
import { openSnap } from './payment';
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
      setReceipt(await loadReceipt(access, true));
      setMessage('Status pesanan diperbarui dari server.');
    }
      catch (e) {
        setError(errorMessage(e));
      }
      finally {
        setBusy(false);
      }
  }
  async function pay() {
    if (busy)
      return; setBusy(true); setError(''); try {
        const p = await shopAction<{
          token: string;
          mode: string;
          clientKey: string;
        }>({ ...access, action: 'payment' });
        await openSnap(p.token, p.mode, p.clientKey, () => { setMessage('Periksa status server untuk memastikan hasil pembayaran.'); void refresh(); });
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
    const text = [`PESANAN ${receipt.order_number}`, customer ? `Nama: ${customer.name}\nAlamat: ${customer.address}\nWhatsApp: ${customer.phone}` : '', ...receipt.items.map(x => `${x.title}${x.variant ? ' (' + x.variant + ')' : ''} × ${x.quantity}: ${money(x.subtotal)}`), `Ongkir: ${money(receipt.shipping_fee)}`, `Total: ${money(receipt.total_price)}`, `Metode: ${receipt.payment_method}`].filter(Boolean).join('\n');
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
          {method.type === 'Midtrans' ? <>
            <p>Total final di bawah telah dihitung oleh server. Lanjutkan hanya setelah nominalnya sesuai.</p>
            <button type="button" className="button" disabled={busy} onClick={pay}>Bayar melalui Midtrans</button>
          </> : <>
            <p>Transfer sesuai total pesanan, kemudian kirim konfirmasi ke Admin. Pesanan tidak otomatis dianggap lunas.</p>
            {method.qris_url ? <Photo src={method.qris_url} alt={'QRIS ' + method.name} className="qris" /> : <>
              <p className="account-number">
                {method.account_number}
              </p>
              <p>Atas nama: <strong>
                {method.account_holder}
              </strong>
              </p>
            </>}
            {wa ? <a className="button" href={wa} target="_blank" rel="noopener noreferrer">Kirim konfirmasi ke WhatsApp</a> : <p className="message">Nomor WhatsApp toko belum diatur. Simpan nomor pesanan dan hubungi toko melalui kanal yang tersedia.</p>}
          </>}
        </>}
        <Message error={error} success={message} />
        <div className="actions">
          <button className="button secondary" disabled={busy} onClick={refresh}>
            {busy ? 'Memeriksa…' : 'Periksa status'}
          </button>
          <button className="button secondary" onClick={() => window.print()}>Cetak ringkasan</button>
        </div>
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
        <div className="split total">
          <span>Total final</span>
          <strong>
            {money(receipt.total_price)}
          </strong>
        </div>
        <small>Status lunas hanya berasal dari verifikasi Admin untuk pembayaran manual atau pemeriksaan server Midtrans.</small>
      </aside>
    </div>
    <button type="button" className="button secondary" onClick={onBack}>Kembali ke katalog</button>
  </section>;
}
