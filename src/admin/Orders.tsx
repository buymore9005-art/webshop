import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { client } from '../../supabaseClient';
import type { Order } from '../types';
import { bookBiteshipShipment, exportOrderPage, getOrders, orderAction } from '../lib/api';
import { printPackingSlip } from '../lib/shipping';
import { dateTime, errorMessage, fulfillmentLabels, money, orderLabels } from '../lib/domain';
import { useResource } from '../lib/useResource';
import { Field, Message, Modal, Pagination } from '../components/UI';
import { adminOrderActions, availableOrderActions, canBookOrderShipment, type AdminOrderAction } from '../lib/adminOrders';
export default function Orders() {
  const [page, setPage] = useState(0), [status, setStatus] = useState(''), [search, setSearch] = useState(''), [start, setStart] = useState(''), [end, setEnd] = useState(''), [rev, setRev] = useState(0);
  const [fulfillment, setFulfillment] = useState('');
  const result = useResource(JSON.stringify([page, status, search, start, end, fulfillment, rev]), () => getOrders(page, status, search, start, end, fulfillment), JSON.stringify(['admin-orders', page, status, search, start, end, fulfillment]));
  const [editing, setEditing] = useState<Order | null>(null), [action, setAction] = useState<AdminOrderAction | ''>(''), [reason, setReason] = useState(''), [tracking, setTracking] = useState(''), [carrier, setCarrier] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const events = useResource('events:' + editing?.id + ':' + rev, async () => {
    if (!editing)
      return []; const { data, error: e } = await client().from('order_events').select('id,event,old_status,new_status,note,created_at').eq('order_id', editing.id).order('created_at', { ascending: false }).limit(50); if (e)
      throw e; return data || [];
  }, 'admin-order-events:' + editing?.id);
  const shipment = useResource('shipment:' + editing?.id + ':' + rev, async () => {
    if (!editing)
      return null;
    const { data, error: e } = await client().from('shipping_shipments').select('*').eq('order_id', editing.id).maybeSingle();
    if (e)
      throw e;
    return data;
  }, 'admin-order-shipment:' + editing?.id);
  useEffect(() => { const channel = client().channel('admin-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => setRev(n => n + 1)).subscribe(); return () => { void client().removeChannel(channel); }; }, []);
  function edit(o: Order) { setEditing(o); setAction(''); setConfirmed(false); setReason(''); setTracking(o.tracking_number); setCarrier(o.carrier); setError(''); setMessage(''); }
  async function refreshDetail() {
    if (!editing || busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: loadError } = await client().from('orders').select('*').eq('id', editing.id).single();
      if (loadError) throw loadError;
      edit(data as Order);
      setRev(n => n + 1);
    }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy || !action || !availableOrderActions(editing).includes(action) || (['paid', 'cancelled'].includes(action) && !confirmed))
      return; setBusy(true); setError(''); try {
        await orderAction(editing.id, editing.version, action, reason, tracking, carrier);
        setEditing(null);
        setRev(n => n + 1);
        setMessage('Perubahan pesanan disimpan.');
      }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      setBusy(false);
    }
  }
  async function bookShipment() {
    if (!editing || busy || !canBookOrderShipment(editing) || shipment.loading || shipment.error || shipment.data)
      return;
    setBusy(true);
    setError('');
    try {
      const result = await bookBiteshipShipment(editing.id);
      setRev(n => n + 1);
      setMessage(result.already_booked ? 'Booking Biteship sudah tercatat.' : 'Shipment Biteship berhasil dibuat.');
      setEditing(null);
    }
    catch (e) {
      setError(errorMessage(e));
      shipment.reload();
    }
    finally {
      setBusy(false);
    }
  }
  function exportPage() {
    try {
      exportOrderPage(result.data?.rows || []);
    }
    catch (e) {
      setError(errorMessage(e));
    }
  }
  function printSlip(order: Order) {
    try {
      printPackingSlip(order);
    }
    catch (e) {
      setError(errorMessage(e));
    }
  }
  return <section className="stack">
    <div className="section-heading">
      <div><h1>Pesanan</h1><p className="muted">Verifikasi pembayaran, siapkan paket, lalu pantau pengiriman.</p></div>
      <div className="actions">
        <button className="button secondary" onClick={() => setRev(n => n + 1)}>Perbarui</button>
        <button className="button secondary" onClick={exportPage} disabled={!result.data?.rows.length}>Ekspor halaman CSV</button>
      </div>
    </div>
    <div className="panel stack">
      <div className="order-filter-shortcuts" role="group" aria-label="Filter cepat pembayaran">
        {[['', 'Semua pesanan'], ['pending', 'Perlu verifikasi'], ['paid', 'Lunas']].map(([value, label]) => <button type="button" key={value} className="button secondary" aria-pressed={status === value} onClick={() => { setStatus(value); setPage(0); }}>{label}</button>)}
      </div>
      <div className="form-grid">
      <Field label="Cari nomor pesanan">
        <input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
      </Field>
      <Field label="Status pembayaran">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>
          <option value="">Semua status</option>
          {Object.entries(orderLabels).map(([value, label]) => <option value={value} key={value}>
            {label}
          </option>)}
        </select>
      </Field>
      <Field label="Dari tanggal">
        <input type="date" value={start} onChange={e => { setStart(e.target.value); setPage(0); }} />
      </Field>
      <Field label="Sampai tanggal">
        <input type="date" value={end} onChange={e => { setEnd(e.target.value); setPage(0); }} />
      </Field>
      <Field label="Status pengiriman">
        <select value={fulfillment} onChange={e => { setFulfillment(e.target.value); setPage(0); }}>
          <option value="">Semua pengiriman</option>
          {Object.entries(fulfillmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      </div>
      <div className="split"><small>{result.data?.count || 0} pesanan sesuai filter</small><button type="button" className="text-button" disabled={!status && !search && !start && !end && !fulfillment} onClick={() => { setStatus(''); setSearch(''); setStart(''); setEnd(''); setFulfillment(''); setPage(0); }}>Reset filter</button></div>
    </div>
    <Message error={editing ? '' : error || result.error} success={message} loading={result.loading} />
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Pesanan</th>
            <th>Pembeli</th>
            <th>Total</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {result.data?.rows.map(o => <tr key={o.id}>
            <td data-label="Pesanan">
              <strong className="order-reference">
                {o.order_number}
              </strong>
              <small>
                {dateTime(o.created_at)}
              </small>
            </td>
            <td data-label="Pembeli">
              {o.customer_name}
              <small>
                {o.customer_phone}
              </small>
            </td>
            <td data-label="Total">
              {money(o.total_price)}
              <small>
                {o.payment_method}
              </small>
            </td>
            <td data-label="Status">
              <span className={'status ' + o.status}>
                {orderLabels[o.status]}
              </span>
              <small><span className={'status ' + o.fulfillment_status}>{fulfillmentLabels[o.fulfillment_status]}</span></small>
            </td>
            <td data-label="Aksi">
              <button className="button secondary" onClick={() => edit(o)}>{availableOrderActions(o).length || canBookOrderShipment(o) ? 'Kelola pesanan' : 'Lihat detail'}</button>
            </td>
          </tr>)}
        </tbody>
      </table>
      {!result.loading && !result.data?.rows.length && <p className="empty">Tidak ada pesanan pada pilihan ini.</p>}
    </div>
    <Pagination page={page} count={result.data?.count || 0} size={20} onChange={setPage} disabled={result.loading} />
    <Modal open={!!editing} title="Detail pesanan" onClose={() => setEditing(null)} busy={busy}>
      {editing && <div className="stack order-detail">
        <div className="order-summary stack"><p className="order-reference">
          {editing.order_number}
        </p>
        <div className="actions"><span className={'status ' + editing.status}>{orderLabels[editing.status]}</span><span className={'status ' + editing.fulfillment_status}>{fulfillmentLabels[editing.fulfillment_status]}</span></div>
        <small>{dateTime(editing.created_at)} · {editing.payment_method}</small>
        <strong>{money(editing.total_price)}</strong>
        <div className="actions"><button type="button" className="button" onClick={() => document.getElementById('order-actions')?.focus()}>Ke tindakan pesanan</button><button type="button" className="button secondary" disabled={busy} onClick={() => void refreshDetail()}>Muat ulang detail</button></div></div>
        <h3>Pembeli & alamat pengiriman</h3>
        <p>
          <strong>
            {editing.customer_name}
          </strong>
          <br />
          {editing.customer_phone}
        </p>
        <p className="preserve-text">
          {[
            editing.customer_address, editing.customer_district, editing.customer_city,
            editing.customer_province, editing.customer_postal_code,
          ].filter(Boolean).join('\n')}
        </p>
        <p><strong>Berat produk:</strong> {editing.total_weight_grams > 0 ? `${editing.total_weight_grams} g` : 'Belum tercatat'} (berat kirim aktual dapat bertambah karena kemasan)</p>
        {editing.customer_note && <p>Catatan: {editing.customer_note}
        </p>}
        <div className="panel stack">
          <h3>Rincian belanja</h3>
          {editing.items.map((item, i) => <div className="split" key={i}>
            <span>
              {item.title}
              <small>
                {item.variant || 'Tanpa varian'} · {item.quantity} × {money(item.unit_price)}{item.weight_grams ? ` · ${item.weight_grams} g/unit` : ''}
              </small>
            </span>
            <strong>
              {money(item.subtotal)}
            </strong>
          </div>)}
          <div className="split">
            <span>Ongkir</span>
            <strong>
              {money(editing.shipping_fee)}
            </strong>
          </div>
          {editing.coupon_code && <div className="split"><span>Diskon kupon ({editing.coupon_code})</span><strong>−{money(editing.discount_amount)}</strong></div>}
          <div className="split border-top">
            <span>Total</span>
            <strong>
              {money(editing.total_price)}
            </strong>
          </div>
        </div>
        <p>
          {editing.payment_method} · {orderLabels[editing.status]} · {fulfillmentLabels[editing.fulfillment_status]}
        </p>
        {editing.shipping_courier_name && <p>Tarif terpilih: {editing.shipping_courier_name} · {editing.shipping_service_name} · {money(editing.shipping_fee)}</p>}
        {editing.tracking_number && <p>Resi: <strong>{editing.tracking_number}</strong> · {editing.carrier}</p>}
        <button type="button" className="button secondary" onClick={() => printSlip(editing)}>Cetak packing slip</button>
        {editing.shipping_quote_id && <section className="panel stack">
          <h3>Pengiriman Biteship</h3>
          <Message error={shipment.error} loading={shipment.loading} />
          {shipment.data && <>
            <p>{shipment.data.carrier_name} · {shipment.data.service_name} · status {shipment.data.status}</p>
            {shipment.data.tracking_number && <p>Resi: <strong>{shipment.data.tracking_number}</strong></p>}
            <small>Referensi booking: {shipment.data.provider_request_id}</small>
            {shipment.data.label_url && <a className="button secondary" href={shipment.data.label_url} target="_blank" rel="noopener noreferrer">Buka label pengiriman</a>}
            {shipment.data.provider_error && <p className="message error">{shipment.data.provider_error}</p>}
            {shipment.data.status === 'created' && <p className="message">Permintaan booking sudah dimulai. Periksa dashboard Biteship sebelum mencoba tindakan lain.</p>}
          </>}
          {!shipment.data && canBookOrderShipment(editing) &&
            <button type="button" className="button" disabled={busy || shipment.loading || !!shipment.error} onClick={() => void bookShipment()}>{busy ? 'Membuat booking…' : 'Buat booking & label Biteship'}</button>}
          {shipment.error && <button type="button" className="button secondary" disabled={busy} onClick={shipment.reload}>Periksa ulang status booking</button>}
        </section>}
        <form id="order-actions" tabIndex={-1} aria-label="Tindakan pesanan" className="panel stack order-action-panel" onSubmit={save}>
          <div><h3>Tindakan pesanan</h3><p className="muted">{editing.status === 'pending' ? 'Periksa mutasi rekening sebelum mengonfirmasi pembayaran.' : 'Lanjutkan sesuai status pesanan. Setiap perubahan dicatat dalam riwayat.'}</p></div>
          <div className="actions">
            {availableOrderActions(editing).map(value => <button type="button" key={value} disabled={busy} aria-pressed={action === value} className={'button ' + (value === 'cancelled' ? 'secondary order-danger' : '')} onClick={() => { setAction(value); setReason(''); setConfirmed(false); setError(''); }}>{adminOrderActions[value]}</button>)}
          </div>
          {!availableOrderActions(editing).length && <p className="muted">{canBookOrderShipment(editing) ? 'Gunakan bagian pengiriman Biteship untuk booking dan label.' : 'Tidak ada tindakan lanjutan untuk status ini.'}</p>}
          {action === 'shipped' && <div className="form-grid">
            <Field label="Kurir">
              <input required maxLength={80} value={carrier} onChange={e => setCarrier(e.target.value)} />
            </Field>
            <Field label="Nomor resi">
              <input required maxLength={120} value={tracking} onChange={e => setTracking(e.target.value)} />
            </Field>
          </div>}
          {action && <>
            <h3>{adminOrderActions[action]}</h3>
            <Field label="Alasan / catatan verifikasi" hint={action === 'paid' ? 'Periksa mutasi rekening terlebih dahulu. Tangkapan layar pembeli bukan bukti tunggal.' : undefined}>
              <textarea required minLength={3} maxLength={2000} rows={2} value={reason} onChange={e => setReason(e.target.value)} />
            </Field>
            {['paid', 'cancelled'].includes(action) && <label className="check"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} /><span>{action === 'paid' ? `Saya sudah memeriksa mutasi dan menerima ${money(editing.total_price)}. Konfirmasi ini tidak otomatis memproses pesanan.` : 'Saya memahami pesanan akan dibatalkan dan stok dikembalikan. Tindakan ini tidak dapat dibatalkan dari halaman ini.'}</span></label>}
            <div className="actions"><button className="button" disabled={busy || (['paid', 'cancelled'].includes(action) && !confirmed)}>
              {busy ? 'Menyimpan…' : action === 'paid' ? 'Konfirmasi pembayaran diterima' : action === 'cancelled' ? 'Ya, batalkan pesanan' : adminOrderActions[action]}
            </button><button type="button" className="button secondary" disabled={busy} onClick={() => { setAction(''); setConfirmed(false); }}>Batal tindakan</button></div>
          </>}
          <Message error={error} />
        </form>
        <h3>Riwayat pesanan</h3>
        <Message error={events.error} loading={events.loading} />
        <div className="event-list">
          {events.data?.map(e => <article key={e.id}>
            <strong>
              {e.event === 'order_created' ? 'Pesanan dibuat' : e.event === 'admin_paid' ? 'Pembayaran dikonfirmasi' : e.event === 'admin_cancelled' ? 'Pesanan dibatalkan' : e.event === 'admin_processing' ? 'Pesanan diproses' : e.event === 'admin_shipped' ? 'Pesanan dikirim' : e.event === 'admin_completed' ? 'Pesanan diselesaikan' : 'Status diperbarui'}
            </strong>
            <small>
              {dateTime(e.created_at)}
            </small>
            <p>
              {e.note}
            </p>
          </article>)}
        </div>
      </div>}
    </Modal>
  </section>;
}
