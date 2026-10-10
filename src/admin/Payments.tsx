import type { FormEvent } from 'react';
import { useState } from 'react';
import type { PaymentMethod, PaymentType } from '../types';
import { getMethods, saveMethod, uploadImage } from '../lib/api';
import { errorMessage } from '../lib/domain';
import { useResource } from '../lib/useResource';
import { Field, Message, Modal, Photo } from '../components/UI';
type Draft = Omit<PaymentMethod, 'id'>;
const blank = (): Draft => ({ name: '', account_number: '', account_holder: '', type: 'Bank', qris_url: '', is_active: true, sort_order: 0 });
export default function Payments() {
  const [rev, setRev] = useState(0);
  const result = useResource('payments:' + rev, () => getMethods(true));
  const [open, setOpen] = useState(false), [id, setId] = useState<string | undefined>(), [draft, setDraft] = useState<Draft>(blank), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  function edit(method?: PaymentMethod) { setId(method?.id); setDraft(method ? { name: method.name, account_number: method.account_number, account_holder: method.account_holder, type: method.type, qris_url: method.qris_url, is_active: method.is_active, sort_order: method.sort_order } : blank()); setError(''); setOpen(true); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy)
      return; setBusy(true); setError(''); try {
        await saveMethod(draft, id);
        setOpen(false);
        setRev(n => n + 1);
        setMessage('Metode pembayaran disimpan.');
      }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file)
      return; setBusy(true); setError(''); try {
        const url = await uploadImage(file, 'qris');
        setDraft(d => ({ ...d, qris_url: url }));
      }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      setBusy(false);
    }
  }
  return <section className="stack">
    <div className="section-heading">
      <h1>Metode pembayaran</h1>
      <button className="button" onClick={() => edit()}>Tambah metode</button>
    </div>
    <Message error={result.error} success={message} loading={result.loading} />
    <div className="method-grid">
      {result.data?.map(m => <article className="panel stack" key={m.id}>
        <div className="split">
          <h2>
            {m.name}
          </h2>
          <span className="status">
            {m.is_active ? 'Aktif' : 'Nonaktif'}
          </span>
        </div>
        <p>
          {m.type}
        </p>
        {m.type === 'QRIS' ? <Photo src={m.qris_url} alt={'QRIS ' + m.name} className="qris" /> : <>
          <p className="account-number">
            {m.account_number}
          </p>
          <p>
            {m.account_holder}
          </p>
        </>}
        <button className="button secondary" onClick={() => edit(m)}>Ubah metode</button>
      </article>)}
    </div>
    {!result.loading && !result.data?.length && <p className="empty">Belum ada metode pembayaran. Tambahkan rekening atau QRIS asli milik toko.</p>}
    <Modal open={open} title={id ? 'Ubah metode pembayaran' : 'Tambah metode pembayaran'} onClose={() => setOpen(false)} busy={busy}>
      <form className="stack" onSubmit={save}>
        <Field label="Nama metode">
          <input required maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Jenis">
          <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as PaymentType })}>
            {(['Bank', 'E-Wallet', 'QRIS'] as PaymentType[]).map(t => <option key={t}>
              {t}
            </option>)}
          </select>
        </Field>
        {['Bank', 'E-Wallet'].includes(draft.type) && <>
          <Field label="Nomor rekening / akun">
            <input required maxLength={100} value={draft.account_number} onChange={e => setDraft({ ...draft, account_number: e.target.value })} />
          </Field>
          <Field label="Atas nama">
            <input required maxLength={150} value={draft.account_holder} onChange={e => setDraft({ ...draft, account_holder: e.target.value })} />
          </Field>
        </>}
        {draft.type === 'QRIS' && <>
          <Photo src={draft.qris_url} alt="QRIS toko" className="qris" />
          <Field label="Unggah QRIS">
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
          </Field>
          <p className="muted">Pembayaran QRIS dikonfirmasi secara manual oleh Admin.</p>
        </>}
        <Field label="Urutan tampilan">
          <input type="number" step={1} value={draft.sort_order} onChange={e => setDraft({ ...draft, sort_order: Number(e.target.value) })} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} />Metode aktif</label>
        <Message error={error} />
        <button className="button" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan metode'}
        </button>
      </form>
    </Modal>
  </section>;
}
