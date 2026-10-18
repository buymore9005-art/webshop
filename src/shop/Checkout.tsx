import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import type { CartLine, Customer, OrderAccess, PaymentMethod, Receipt, Settings, ShippingArea, ShippingRate } from '../types';
import { cartTotals, money, validateCustomer, errorMessage } from '../lib/domain';
import { getShippingRates, readOrderAccess, submitOrder, validateCoupon } from '../lib/api';
import { Field, Message, Photo } from '../components/UI';
import { ShippingAreaPicker } from '../components/ShippingAreaPicker';
export function Checkout({ cart, settings, methods, onDone, onBack }: {
  cart: CartLine[];
  settings: Settings;
  methods: PaymentMethod[];
  onDone: (receipt: Receipt, access: OrderAccess, customer: Customer) => void;
  onBack: () => void;
}) {
  const [customer, setCustomer] = useState<Customer>({ name: '', phone: '', address: '', district: '', city: '', province: '', postal_code: '', note: '' });
  const [payment, setPayment] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [couponCode, setCouponCode] = useState(''), [couponBusy, setCouponBusy] = useState(false);
  const [couponQuote, setCouponQuote] = useState<{ code: string; discount_amount: number; subtotal: number; phone: string } | null>(null);
  const [destinationArea, setDestinationArea] = useState<ShippingArea | null>(null);
  const [shippingQuote, setShippingQuote] = useState<{
    quote_id: string; expires_at: string; subtotal: number; rates: ShippingRate[]; cartKey: string; areaId: string;
  } | null>(null);
  const [selectedShippingRate, setSelectedShippingRate] = useState('');
  const [shippingBusy, setShippingBusy] = useState(false);
  const flight = useRef(false);
  const biteship = settings.shipping_provider === 'biteship';
  const cartKey = JSON.stringify(cart.map(item => [item.product_id, item.variant, item.quantity]));
  const totals = cartTotals(cart, biteship ? 0 : Number(settings.shipping_fee), biteship ? null : settings.free_shipping_min === null ? null : Number(settings.free_shipping_min));
  const validShippingQuote = biteship && shippingQuote && shippingQuote.cartKey === cartKey &&
    shippingQuote.areaId === destinationArea?.id && Date.parse(shippingQuote.expires_at) > Date.now() ? shippingQuote : null;
  const subtotal = biteship && validShippingQuote ? validShippingQuote.subtotal : totals.subtotal;
  const validCouponQuote = couponQuote && couponQuote.subtotal === subtotal && couponQuote.phone === customer.phone && couponQuote.code === couponCode.trim().toUpperCase() ? couponQuote : null;
  const shippingRate = validShippingQuote?.rates.find(rate => rate.key === selectedShippingRate) || null;
  const finalEstimate = subtotal + (biteship ? shippingRate?.amount || 0 : totals.shipping) - (validCouponQuote?.discount_amount || 0);
  function selectDestinationArea(area: ShippingArea) {
    setDestinationArea(area);
    setCustomer({
      ...customer,
      destination_area_id: area.id,
      district: area.district || customer.district,
      city: area.city || customer.city,
      province: area.province || customer.province,
      postal_code: /^\d{5}$/.test(area.postal_code) ? area.postal_code : customer.postal_code,
    });
    setShippingQuote(null);
    setSelectedShippingRate('');
  }
  function editDestinationRegion(field: 'district' | 'city' | 'province' | 'postal_code', value: string) {
    setCustomer({ ...customer, [field]: value, destination_area_id: undefined });
    setDestinationArea(null);
    setShippingQuote(null);
    setSelectedShippingRate('');
  }
  async function calculateShipping() {
    if (shippingBusy || busy || !destinationArea)
      return;
    setShippingBusy(true);
    setError('');
    setShippingQuote(null);
    setSelectedShippingRate('');
    try {
      const result = await getShippingRates(cart, destinationArea.id, customer.postal_code);
      setShippingQuote({ ...result, cartKey, areaId: destinationArea.id });
    }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      setShippingBusy(false);
    }
  }
  async function applyCoupon() {
    if (couponBusy || busy)
      return;
    setCouponBusy(true);
    setError('');
    setCouponQuote(null);
    try {
      const valid = validateCustomer(customer);
      const result = await validateCoupon(couponCode, biteship && validShippingQuote ? validShippingQuote.subtotal : totals.subtotal, valid.phone);
      setCouponQuote({ ...result, subtotal: biteship && validShippingQuote ? validShippingQuote.subtotal : totals.subtotal, phone: customer.phone });
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
      if (couponCode.trim() && !validCouponQuote)
        throw new Error('Periksa dan gunakan kembali kupon setelah perubahan nomor WhatsApp atau isi keranjang.');
      if (biteship && validShippingQuote && Date.parse(validShippingQuote.expires_at) <= Date.now())
        throw new Error('Tarif Biteship sudah kedaluwarsa. Hitung kembali tarif.');
      if (biteship && (!validShippingQuote || !shippingRate || !destinationArea))
        throw new Error('Pilih lokasi tujuan dan hitung kembali tarif Biteship sebelum membuat pesanan.');
      const customerWithArea = biteship ? { ...valid, destination_area_id: destinationArea?.id } : valid;
      const result = await submitOrder(
        cart, customerWithArea, payment, readOrderAccess(), validCouponQuote?.code || '',
        biteship ? validShippingQuote?.quote_id : '',
        biteship ? shippingRate?.key : '',
      );
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
          <Field label="Alamat jalan" hint="Jalan, nomor rumah, kelurahan/komplek, dan detail patokan.">
            <textarea required autoComplete="street-address" minLength={10} maxLength={500} rows={3} value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })} />
          </Field>
          {biteship && <div className="panel stack">
            <h3>Lokasi kurir Biteship</h3>
            <ShippingAreaPicker label="Cari kecamatan/kota tujuan" hint="Pilih area yang benar. Pilihan area akan mengisi wilayah dan kode pos bila tersedia." onSelect={selectDestinationArea} />
            {destinationArea && <p className="muted">Area dipilih: {destinationArea.label} ({destinationArea.id})</p>}
          </div>}
          <div className="form-grid">
            <Field label="Kecamatan">
              <input required maxLength={100} autoComplete="address-level3" value={customer.district} onChange={e => biteship ? editDestinationRegion('district', e.target.value) : setCustomer({ ...customer, district: e.target.value })} />
            </Field>
            <Field label="Kota/Kabupaten">
              <input required maxLength={100} autoComplete="address-level2" value={customer.city} onChange={e => biteship ? editDestinationRegion('city', e.target.value) : setCustomer({ ...customer, city: e.target.value })} />
            </Field>
            <Field label="Provinsi">
              <input required maxLength={100} autoComplete="address-level1" value={customer.province} onChange={e => biteship ? editDestinationRegion('province', e.target.value) : setCustomer({ ...customer, province: e.target.value })} />
            </Field>
            <Field label="Kode pos">
              <input required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" value={customer.postal_code} onChange={e => biteship ? editDestinationRegion('postal_code', e.target.value.replace(/\D/g, '').slice(0, 5)) : setCustomer({ ...customer, postal_code: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
            </Field>
          </div>
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
            {money(subtotal)}
          </span>
        </div>
        <div className="split">
          <span>{biteship ? 'Ongkos kirim Biteship' : 'Ongkos kirim tetap'}</span>
          <span>{biteship ? shippingRate ? money(shippingRate.amount) : 'Pilih layanan' : money(totals.shipping)}</span>
        </div>
        {biteship && <section className="panel stack">
          <p className="muted">Tarif berasal dari Biteship dan berlaku terbatas. Dimensi serta berat produk harus diisi Admin.</p>
          <button type="button" className="button secondary" disabled={shippingBusy || busy || !destinationArea} onClick={() => void calculateShipping()}>
            {shippingBusy ? 'Menghitung tarif…' : validShippingQuote ? 'Hitung ulang tarif' : 'Hitung tarif kurir'}
          </button>
          {validShippingQuote?.rates.map(rate => <label className={'payment-option ' + (selectedShippingRate === rate.key ? 'selected' : '')} key={rate.key}>
            <input type="radio" name="shipping-rate" checked={selectedShippingRate === rate.key} onChange={() => setSelectedShippingRate(rate.key)} />
            <span><strong>{rate.courier_name} · {rate.service_name}</strong><small>{money(rate.amount)}{rate.estimated_days ? ` · estimasi ${rate.estimated_days}` : ''}</small></span>
          </label>)}
          {validShippingQuote && !validShippingQuote.rates.length && <p className="muted">Tidak ada layanan tersedia.</p>}
        </section>}
        <div className="coupon-entry">
          <Field label="Kode kupon (opsional)">
            <input maxLength={40} autoCapitalize="characters" value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponQuote(null); }} />
          </Field>
          <button type="button" className="button secondary" disabled={busy || couponBusy || !couponCode.trim()} onClick={() => void applyCoupon()}>{couponBusy ? 'Memeriksa…' : validCouponQuote ? 'Terapkan ulang' : 'Gunakan kupon'}</button>
        </div>
        {validCouponQuote && <div className="split"><span>Diskon kupon ({validCouponQuote.code})</span><strong>−{money(validCouponQuote.discount_amount)}</strong></div>}
        <div className="split total">
          <span>Estimasi total{validCouponQuote ? ' setelah diskon' : ''}</span>
          <strong>
            {money(finalEstimate)}
          </strong>
        </div>
        <p className="muted">Harga, stok, dan tarif pengiriman diperiksa kembali di server. Tinjau total final pada halaman berikutnya sebelum membayar.</p>
        <Message error={error} />
        <button className="button wide" disabled={busy || couponBusy || shippingBusy || !methods.length || (biteship && (!validShippingQuote || !shippingRate))}>
          {busy ? 'Menyimpan pesanan…' : 'Buat pesanan'}
        </button>
        <small>Data pengiriman digunakan untuk memproses pesanan dan dapat dikirim ke WhatsApp Admin atas pilihan Anda.</small>
      </aside>
    </form>
  </section>;
}
