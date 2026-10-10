import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { client } from '../../supabaseClient';
import type { Order } from '../types';
import { exportOrderPage, getOrders, orderAction } from '../lib/api';
import { printPackingSlip } from '../lib/shipping';
import { dateTime, errorMessage, fulfillmentLabels, money, orderLabels } from '../lib/domain';
import { useResource } from '../lib/useResource';
import { Field, Message, Modal, Pagination } from '../components/UI';
export default function Orders() {
  const [page, setPage] = useState(0), [status, setStatus] = useState(''), [search, setSearch] = useState(''), [start, setStart] = useState(''), [end, setEnd] = useState(''), [rev, setRev] = useState(0);
  const result = useResource(JSON.stringify([page, status, search, start, end, rev]), () => getOrders(page, status, search, start, end));
  const [editing, setEditing] = useState<Order | null>(null), [action, setAction] = useState(''), [reason, setReason] = useState(''), [tracking, setTracking] = useState(''), [carrier, setCarrier] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const events = useResource('events:' + editing?.id + ':' + rev, async () => {
    if (!editing)
      return []; const { data, error: e } = await client().from('order_events').select('id,event,old_status,new_status,note,created_at').eq('order_id', editing.id).order('created_at', { ascending: false }).limit(50); if (e)
      throw e; return data || [];
  });
  useEffect(() => { const channel = client().channel('admin-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => setRev(n => n + 1)).subscribe(); return () => { void client().removeChannel(channel); }; }, []);
  function edit(o: Order) { setEditing(o); setAction(''); setReason(''); setTracking(o.tracking_number); setCarrier(o.carrier); setError(''); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy)
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
      <h1>Pesanan</h1>
      <div className="actions">
        <button className="button secondary" onClick={() => setRev(n => n + 1)}>Perbarui</button>
        <button className="button secondary" onClick={exportPage} disabled={!result.data?.rows.length}>Ekspor halaman CSV</button>
      </div>
    </div>
    <div className="panel form-grid">
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
              <small>
                {fulfillmentLabels[o.fulfillment_status]}
              </small>
            </td>
            <td data-label="Aksi">
              <button className="button secondary" onClick={() => edit(o)}>Lihat detail</button>
            </td>
          </tr>)}
        </tbody>
      </table>
      {!result.loading && !result.data?.rows.length && <p className="empty">Tidak ada pesanan pada pilihan ini.</p>}
    </div>
    <Pagination page={page} count={result.data?.count || 0} size={20} onChange={setPage} disabled={result.loading} />
    <Modal open={!!editing} title="Detail pesanan" onClose={() => setEditing(null)} busy={busy}>
      {editing && <div className="stack">
        <p className="order-reference">
          {editing.order_number}
        </p>
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
        <button type="button" className="button secondary" onClick={() => printSlip(editing)}>Cetak packing slip</button>
        <form className="stack" onSubmit={save}>
          <Field label="Tindakan">
            <select required value={action} onChange={e => setAction(e.target.value)}>
              <option value="">Pilih tindakan</option>
              {editing.status === 'pending' && <>
                <option value="paid">Konfirmasi pembayaran diterima</option>
                <option value="cancelled">Batalkan pesanan dan kembalikan stok</option>
              </>}
              {['paid', 'partial_refund'].includes(editing.status) && <>
                {editing.fulfillment_status === 'unfulfilled' && <option value="processing">Mulai proses pesanan</option>}
                {editing.fulfillment_status === 'processing' && <option value="shipped">Kirim pesanan</option>}
                {editing.fulfillment_status === 'shipped' && <option value="completed">Selesaikan pesanan</option>}
              </>}
            </select>
          </Field>
          {action === 'shipped' && <div className="form-grid">
            <Field label="Kurir">
              <input required maxLength={80} value={carrier} onChange={e => setCarrier(e.target.value)} />
            </Field>
            <Field label="Nomor resi">
              <input required maxLength={120} value={tracking} onChange={e => setTracking(e.target.value)} />
            </Field>
          </div>}
          {action && <>
            <Field label="Alasan / catatan verifikasi" hint={action === 'paid' ? 'Periksa mutasi rekening terlebih dahulu. Tangkapan layar pembeli bukan bukti tunggal.' : undefined}>
              <textarea required minLength={3} maxLength={2000} rows={2} value={reason} onChange={e => setReason(e.target.value)} />
            </Field>
            <button className="button" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan tindakan'}
            </button>
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
