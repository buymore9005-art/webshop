import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import type { Settings as SettingsType } from '../types';
import { getSettings, saveSettings, uploadImage } from '../lib/api';
import { errorMessage, normalizePhone } from '../lib/domain';
import { useResource } from '../lib/useResource';
import { Field, Message, Photo } from '../components/UI';
export default function Settings({ whatsappOnly = false }: {
  whatsappOnly?: boolean;
}) {
  const result = useResource('settings-admin:' + whatsappOnly, () => getSettings());
  const [draft, setDraft] = useState<SettingsType | null>(null), [newCategory, setNewCategory] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (result.data)
      setDraft(result.data);
  }, [result.data]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy)
      return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const admin_phone = draft.admin_phone.trim() ? normalizePhone(draft.admin_phone) : '';
      const payload = whatsappOnly ? { admin_phone } : { store_name: draft.store_name.trim(), banner_url: draft.banner_url, hero_title: draft.hero_title.trim(), store_notice: draft.store_notice.trim(), categories: draft.categories, admin_phone, shipping_fee: Number(draft.shipping_fee), free_shipping_min: draft.free_shipping_min === null ? null : Number(draft.free_shipping_min) };
      setDraft(await saveSettings(payload, draft.updated_at));
      setMessage('Pengaturan berhasil disimpan.');
    }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      setBusy(false);
    }
  }
  async function banner(file?: File) {
    if (!file || !draft)
      return; setBusy(true); setError(''); try {
        const url = await uploadImage(file, 'banners');
        setDraft(d => d ? { ...d, banner_url: url } : d);
      }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      setBusy(false);
    }
  }
  function addCategory() {
    const name = newCategory.trim(); if (!name || !draft)
      return; if (name.length > 100 || draft.categories.length >= 50) {
        setError('Maksimal 50 kategori; nama maksimal 100 karakter.');
        return;
      } if (draft.categories.some(c => c.toLowerCase() === name.toLowerCase())) {
        setError('Kategori sudah ada.');
        return;
      } setDraft({ ...draft, categories: [...draft.categories, name] }); setNewCategory('');
  }
  return <section className="stack">
    <h1>
      {whatsappOnly ? 'WhatsApp toko' : 'Pengaturan'}
    </h1>
    <Message error={result.error} loading={result.loading} />
    {draft && <form className="stack" onSubmit={save}>
      <div className="panel stack">
        <h2>Kontak toko</h2>
        <Field label="WhatsApp Admin" hint="Nomor ini digunakan untuk tautan chat/konfirmasi manual, bukan gateway pesan otomatis.">
          <input type="tel" value={draft.admin_phone} onChange={e => setDraft({ ...draft, admin_phone: e.target.value })} />
        </Field>
      </div>
      {!whatsappOnly && <>
        <div className="panel stack">
          <h2>Tampilan toko</h2>
          <div className="form-grid">
            <Field label="Nama toko">
              <input required maxLength={100} value={draft.store_name} onChange={e => setDraft({ ...draft, store_name: e.target.value })} />
            </Field>
            <Field label="Judul banner">
              <input maxLength={120} value={draft.hero_title} onChange={e => setDraft({ ...draft, hero_title: e.target.value })} />
            </Field>
          </div>
          <Field label="Keterangan toko">
            <textarea rows={2} maxLength={500} value={draft.store_notice} onChange={e => setDraft({ ...draft, store_notice: e.target.value })} />
          </Field>
          <Photo src={draft.banner_url} alt="Banner toko" className="banner-preview" />
          <Field label="Unggah banner">
            <input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void banner(e.target.files?.[0]); e.target.value = ''; }} />
          </Field>
          {draft.banner_url && <button type="button" className="text-button" onClick={() => setDraft({ ...draft, banner_url: '' })}>Lepas banner</button>}
        </div>
        <div className="panel stack">
          <h2>Kategori</h2>
          <div className="actions">
            <Field label="Kategori baru">
              <input maxLength={100} value={newCategory} onChange={e => setNewCategory(e.target.value)} />
            </Field>
            <button type="button" className="button secondary" onClick={addCategory}>Tambah kategori</button>
          </div>
          <div className="chips">
            {draft.categories.map(c => <span className="chip" key={c}>
              {c}
              <button type="button" className="text-button" aria-label={'Hapus kategori ' + c} onClick={() => setDraft({ ...draft, categories: draft.categories.filter(x => x !== c) })}>Hapus</button>
            </span>)}
          </div>
          <small>Menghapus kategori tidak menghapus produk. Ubah kategori produk secara terpisah bila diperlukan.</small>
        </div>
        <div className="panel stack">
          <h2>Pengiriman</h2>
          <div className="form-grid">
            <Field label="Ongkos kirim tetap (Rp)">
              <input required type="number" min={0} max={1000000000} step={1} value={draft.shipping_fee} onChange={e => setDraft({ ...draft, shipping_fee: Number(e.target.value) })} />
            </Field>
            <Field label="Gratis ongkir mulai subtotal (Rp)" hint="Kosong = tidak ada batas gratis ongkir. Ini tarif tetap, bukan integrasi tarif kurir.">
              <input type="number" min={0} max={1000000000} step={1} value={draft.free_shipping_min ?? ''} onChange={e => setDraft({ ...draft, free_shipping_min: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
          </div>
        </div>
      </>}
      <Message error={error} success={message} />
      <button className="button" disabled={busy}>
        {busy ? 'Menyimpan…' : 'Simpan pengaturan'}
      </button>
    </form>}
  </section>;
}
