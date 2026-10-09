import { useState } from 'react';
import { getSummary } from '../lib/api';
import { money, orderLabels } from '../lib/domain';
import { useResource } from '../lib/useResource';
import { Field, Message } from '../components/UI';
export default function Dashboard({ analytics = false }: {
  analytics?: boolean;
}) {
  const [start, setStart] = useState(''), [end, setEnd] = useState('');
  const resource = useResource('summary:' + start + ':' + end, () => getSummary(start, end));
  const s = resource.data;
  return <section className="stack">
    <div className="section-heading">
      <h1>
        {analytics ? 'Analitik pesanan' : 'Dashboard'}
      </h1>
      <button className="button secondary" onClick={resource.reload}>Perbarui</button>
    </div>
    <div className="panel form-grid">
      <Field label="Dari tanggal (WIB)">
        <input type="date" value={start} onChange={e => setStart(e.target.value)} />
      </Field>
      <Field label="Sampai tanggal (WIB)">
        <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
      </Field>
    </div>
    <Message error={resource.error} loading={resource.loading} />
    {s && <>
      <div className="stat-grid">
        {[['Pendapatan terverifikasi', money(s.revenue)], ['Jumlah pesanan', s.orders], ['Menunggu pembayaran', s.pending], ['Produk aktif', s.products]].map(([label, value]) => <div className="panel stat" key={label}>
          <span>
            {label}
          </span>
          <strong>
            {value}
          </strong>
        </div>)}
      </div>
      <p className="muted">Pendapatan menghitung pesanan lunas, termasuk ongkir, dikurangi refund yang dikonfirmasi server. Bukan jumlah semua pesanan tertunda.</p>
      <div className="form-grid">
        <section className="panel stack">
          <h2>Status pesanan</h2>
          {s.statuses.map(x => <div key={x.status}>
            <div className="split">
              <span>
                {orderLabels[x.status]}
              </span>
              <strong>
                {x.count}
              </strong>
            </div>
            <meter min={0} max={Math.max(1, s.orders)} value={x.count} aria-label={orderLabels[x.status]} />
          </div>)}
          {!s.statuses.length && <p className="empty">Belum ada pesanan pada periode ini.</p>}
        </section>
        <section className="panel stack">
          <h2>Produk terjual</h2>
          <small>Total item pada pesanan lunas; subtotal produk belum mengalokasikan refund sebagian.</small>
          {s.top_products.map((p, i) => <div className="split" key={i}>
            <span>
              {p.title}
              <small>
                {p.quantity} barang</small>
            </span>
            <strong>
              {money(p.revenue)}
            </strong>
          </div>)}
          {!s.top_products.length && <p className="empty">Belum ada produk terjual terverifikasi.</p>}
        </section>
      </div>
    </>}
  </section>;
}
