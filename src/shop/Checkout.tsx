import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import type { CartLine, Customer, OrderAccess, PaymentMethod, Receipt, Settings } from '../types';
import { cartTotals, money, validateCustomer, errorMessage } from '../lib/domain';
import { readOrderAccess, submitOrder, validateCoupon } from '../lib/api';
import { Field, Message, Photo } from '../components/UI';
export function Checkout({ cart, settings, methods, onDone, onBack }: {
  cart: CartLine[];
  settings: Settings;
  methods: PaymentMethod[];
  onDone: (receipt: Receipt, access: OrderAccess, customer: Customer) => void;
  onBack: () => void;
}) {
  const [customer, setCustomer] = useState<Customer>({ name: '', phone: '', address: '', note: '' });
  const [payment, setPayment] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [couponCode, setCouponCode] = useState(''), [couponBusy, setCouponBusy] = useState(false);
  const [couponQuote, setCouponQuote] = useState<{ code: string; discount_amount: number; subtotal: number; phone: string } | null>(null);
  const flight = useRef(false);
  const totals = cartTotals(cart, Number(settings.shipping_fee), settings.free_shipping_min === null ? null : Number(settings.free_shipping_min));
  const activeCoupon = couponQuote && couponQuote.subtotal === totals.subtotal && couponQuote.phone === customer.phone && couponQuote.code === couponCode.trim().toUpperCase() ? couponQuote : null;
  const finalEstimate = totals.total - (activeCoupon?.discount_amount || 0);
  async function applyCoupon() {
    if (couponBusy || busy)
      return;
    setCouponBusy(true);
    setError('');
    setCouponQuote(null);
    try {
      const valid = validateCustomer(customer);
      const result = await validateCoupon(couponCode, totals.subtotal, valid.phone);
      setCouponQuote({ ...result, subtotal: totals.subtotal, phone: customer.phone });
    }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      setCouponBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (flight.current)
      return;
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      const valid = validateCustomer(customer);
      if (!payment)
        throw new Error('Pilih metode pembayaran.');
      if (couponCode.trim() && !activeCoupon)
        throw new Error('Periksa dan gunakan kembali kupon setelah perubahan nomor WhatsApp atau isi keranjang.');
      const result = await submitOrder(cart, valid, payment, readOrderAccess(), activeCoupon?.code || '');
      onDone(result.receipt, result.access, valid);
    }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      flight.current = false;
      setBusy(false);
    }
  }
  if (!cart.length)
    return <section className="container section">
      <h1>Keranjang kosong</h1>
      <button className="button" onClick={onBack}>Kembali ke katalog</button>
    </section>;
  return <section className="container section">
    <button className="text-button" type="button" disabled={busy} onClick={onBack}>Kembali ke katalog</button>
    <h1>Checkout</h1>
    <form className="checkout-grid" onSubmit={submit}>
      <div className="stack">
        <section className="panel stack">
          <h2>Detail pengiriman</h2>
          <Field label="Nama lengkap">
            <input required autoComplete="name" minLength={2} maxLength={120} value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
          </Field>
          <Field label="Nomor WhatsApp" hint="Gunakan nomor Indonesia, misalnya 08… atau 62….">
            <input required type="tel" autoComplete="tel" maxLength={20} value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} />
          </Field>
          <Field label="Alamat lengkap" hint="Cantumkan jalan, nomor rumah, kelurahan, kecamatan, kota, dan kode pos.">
            <textarea required autoComplete="street-address" minLength={10} maxLength={1000} rows={4} value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })} />
          </Field>
          <Field label="Catatan pesanan (opsional)">
            <textarea maxLength={500} rows={2} value={customer.note} onChange={e => setCustomer({ ...customer, note: e.target.value })} />
          </Field>
        </section>
        <fieldset className="panel stack">
          <legend>Metode pembayaran</legend>
          {!methods.length && <p className="message error">Belum ada metode pembayaran aktif. Hubungi pengelola toko.</p>}
          {methods.map(m => <label className={'payment-option ' + (payment === m.id ? 'selected' : '')} key={m.id}>
            <input type="radio" name="payment" required value={m.id} checked={payment === m.id} onChange={() => setPayment(m.id)} />
            <span>
              <strong>
                {m.name}
              </strong>
              <small>
                {m.type === 'QRIS' ? 'QRIS, konfirmasi manual Admin' : m.account_number + ' · ' + m.account_holder}
              </small>
            </span>
          </label>)}
        </fieldset>
      </div>
      <aside className="panel checkout-summary stack">
        <h2>Ringkasan pesanan</h2>
        {cart.map(x => <div className="split" key={x.product_id + '|' + x.variant}>
          <span>
            {x.title}
            <small>
              {x.variant || 'Tanpa varian'} · {x.quantity} barang</small>
          </span>
          <strong>
            {money(x.price * x.quantity)}
          </strong>
        </div>)}
        <div className="split border-top">
          <span>Subtotal</span>
          <span>
            {money(totals.subtotal)}
          </span>
        </div>
        <div className="split">
          <span>Ongkos kirim</span>
          <span>
            {money(totals.shipping)}
          </span>
        </div>
        <div className="coupon-entry">
          <Field label="Kode kupon (opsional)">
            <input maxLength={40} autoCapitalize="characters" value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponQuote(null); }} />
          </Field>
          <button type="button" className="button secondary" disabled={busy || couponBusy || !couponCode.trim()} onClick={() => void applyCoupon()}>{couponBusy ? 'Memeriksa…' : activeCoupon ? 'Terapkan ulang' : 'Gunakan kupon'}</button>
        </div>
        {activeCoupon && <div className="split"><span>Diskon kupon ({activeCoupon.code})</span><strong>−{money(activeCoupon.discount_amount)}</strong></div>}
        <div className="split total">
          <span>Estimasi total{activeCoupon ? ' setelah diskon' : ''}</span>
          <strong>
            {money(finalEstimate)}
          </strong>
        </div>
        <p className="muted">Harga dan ketersediaan diperiksa kembali di server. Tinjau total final pada halaman berikutnya sebelum membayar.</p>
        <Message error={error} />
        <button className="button wide" disabled={busy || couponBusy || !methods.length}>
          {busy ? 'Menyimpan pesanan…' : 'Buat pesanan'}
        </button>
        <small>Data pengiriman digunakan untuk memproses pesanan dan dapat dikirim ke WhatsApp Admin atas pilihan Anda.</small>
      </aside>
    </form>
  </section>;
}
