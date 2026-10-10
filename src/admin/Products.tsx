import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import type { Product } from '../types';
import { getProducts, getSettings, importProducts, saveProduct, uploadImage } from '../lib/api';
import { errorMessage, money, parseProductCsv } from '../lib/domain';
import type { ProductImportRow } from '../lib/domain';
import { useResource } from '../lib/useResource';
import { Field, Message, Modal, Pagination, Photo } from '../components/UI';
type Draft = Pick<Product, 'title' | 'price' | 'description' | 'category' | 'image_url' | 'images' | 'variants' | 'stock' | 'is_active'>;
const blank = (): Draft => ({ title: '', price: 0, description: '', category: '', image_url: '', images: [], variants: [], stock: null, is_active: true });
export default function Products() {
  const [page, setPage] = useState(0), [search, setSearch] = useState(''), [revision, setRevision] = useState(0);
  const result = useResource(JSON.stringify([page, search, revision]), s => getProducts({ page, search, category: '', sort: 'newest', admin: true }, s));
  const settings = useResource('product-categories', () => getSettings());
  const [open, setOpen] = useState(false), [original, setOriginal] = useState<Product | undefined>(), [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [showImport, setShowImport] = useState(false), [importRows, setImportRows] = useState<ProductImportRow[]>([]);
  function edit(p?: Product) { setOriginal(p); setDraft(p ? { title: p.title, price: p.price, description: p.description, category: p.category, image_url: p.image_url, images: [...(p.images || [])], variants: (p.variants || []).map(v => ({ ...v })), stock: p.stock, is_active: p.is_active } : blank()); setOpen(true); setError(''); }
  async function upload(files: FileList | null, variantIndex?: number) {
    if (!files?.length || uploading)
      return;
    setUploading(true);
    setError('');
    try {
      if (variantIndex === undefined && draft.images.length + files.length > 5)
        throw new Error('Galeri maksimal lima gambar.');
      for (const file of Array.from(files)) {
        const url = await uploadImage(file, variantIndex === undefined ? 'catalog' : 'variants');
        setDraft(d => variantIndex === undefined ? { ...d, images: [...d.images, url], image_url: d.image_url || url } : { ...d, variants: d.variants.map((v, i) => i === variantIndex ? { ...v, image: url } : v) });
      }
    }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      setUploading(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || uploading)
      return; setBusy(true); setError(''); try {
        await saveProduct(draft, original);
        setOpen(false);
        setMessage('Produk berhasil disimpan.');
        setRevision(n => n + 1);
      }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      setBusy(false);
    }
  }
  async function toggle(p: Product) {
    if (busy)
      return; if (!window.confirm((p.is_active ? 'Nonaktifkan' : 'Aktifkan') + ' produk ' + p.title + '?'))
      return; setBusy(true); setError(''); try {
        await saveProduct({ ...p, is_active: !p.is_active }, p);
        setRevision(n => n + 1);
        setMessage('Status produk diperbarui.');
      }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      setBusy(false);
    }
  }
  async function stageImport(file?: File) {
    setError('');
    setImportRows([]);
    if (!file)
      return;
    try {
      if (file.size === 0 || file.size > 1024 * 1024)
        throw new Error('File CSV harus berukuran 1 byte–1 MB.');
      const rows = parseProductCsv(await file.text());
      setImportRows(rows);
      setMessage(`${rows.length} produk lolos validasi dan siap ditinjau.`);
    }
    catch (e) {
      setError(errorMessage(e));
    }
  }
  async function runImport() {
    if (busy || !importRows.length)
      return;
    setBusy(true);
    setError('');
    try {
      const count = await importProducts(importRows);
      setImportRows([]);
      setShowImport(false);
      setRevision(value => value + 1);
      setMessage(`${count} produk berhasil diimpor.`);
    }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      setBusy(false);
    }
  }
  function downloadTemplate() {
    const csv = '\uFEFFtitle,price,description,category,image_url,stock,is_active\r\nTas contoh,125000,"Deskripsi produk",Tas,,10,true\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template-impor-produk.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  useEffect(() => {
    if (result.data && page > 0 && !result.data.rows.length)
      setPage(Math.max(0, Math.ceil(result.data.count / 16) - 1));
  }, [result.data?.count]);
  return <section className="stack">
    <div className="section-heading">
      <h1>Produk & katalog</h1>
      <div className="actions">
        <button className="button secondary" onClick={() => { setShowImport(value => !value); setImportRows([]); setError(''); }}>Impor CSV</button>
        <button className="button" onClick={() => edit()}>Tambah produk</button>
      </div>
    </div>
    <Message error={open ? '' : error || result.error} success={message} loading={result.loading} />
    {showImport && <section className="panel stack">
      <div><h2>Impor produk dari CSV</h2><p className="muted">Maksimal 250 produk dan 1 MB per file. Harga dalam Rupiah. Seluruh baris divalidasi sebelum dikirim sebagai satu operasi database.</p></div>
      <p className="import-format"><code>title,price,description,category,image_url,stock,is_active</code><br />Kolom wajib: title, price. Kolom opsional: description, category, image_url, stock, is_active. Stok kosong berarti tidak dibatasi; URL gambar harus HTTPS. Teks berkoma/baris baru harus dibungkus tanda kutip CSV. Impor menambahkan produk baru tanpa foto galeri atau varian.</p>
      <button type="button" className="text-button" onClick={downloadTemplate}>Unduh template CSV</button>
      <Field label="Pilih file CSV">
        <input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { void stageImport(event.target.files?.[0]); event.target.value = ''; }} />
      </Field>
      {!!importRows.length && <>
        <p role="status">{importRows.length} produk valid; pratinjau maksimal 10 baris.</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Nama produk</th><th>Harga</th><th>Kategori</th><th>Stok</th></tr></thead><tbody>
          {importRows.slice(0, 10).map((row, index) => <tr key={index}><td data-label="Nama produk">{row.title}</td><td data-label="Harga">{money(row.price)}</td><td data-label="Kategori">{row.category || 'Tanpa kategori'}</td><td data-label="Stok">{row.stock === null ? 'Tidak dibatasi' : row.stock}</td></tr>)}
        </tbody></table></div>
        <button className="button" disabled={busy} onClick={() => void runImport()}>{busy ? 'Mengimpor…' : `Impor ${importRows.length} produk`}</button>
      </>}
    </section>}
    <div className="panel">
      <Field label="Cari produk">
        <input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Nama produk…" />
      </Field>
    </div>
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Produk</th>
            <th>Kategori / varian</th>
            <th>Harga / stok</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {result.data?.rows.map(p => <tr key={p.id}>
            <td data-label="Produk">
              <div className="table-product">
                <Photo src={p.image_url} alt={p.title} />
                <strong>
                  {p.title}
                </strong>
              </div>
            </td>
            <td data-label="Kategori / varian">
              {p.category || 'Tanpa kategori'}
              <small>
                {p.variants.map(v => v.name).join(', ') || 'Tanpa varian'}
              </small>
            </td>
            <td data-label="Harga / stok">
              {money(p.price)}
              <small>
                {p.stock === null ? 'Stok tidak dibatasi' : 'Stok tersedia: ' + p.stock}
              </small>
            </td>
            <td data-label="Status">
              <span className={'status ' + (p.is_active ? 'paid' : 'cancelled')}>
                {p.is_active ? 'Aktif' : 'Nonaktif'}
              </span>
            </td>
            <td data-label="Aksi">
              <div className="actions">
                <button className="button secondary" disabled={busy} onClick={() => edit(p)}>Ubah</button>
                <button className="text-button" disabled={busy} onClick={() => toggle(p)}>
                  {p.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
              </div>
            </td>
          </tr>)}
        </tbody>
      </table>
      {!result.loading && !result.data?.rows.length && <p className="empty">Belum ada produk. Tambahkan produk pertama Anda.</p>}
    </div>
    <Pagination page={page} count={result.data?.count || 0} size={16} onChange={setPage} disabled={result.loading} />
    <Modal open={open} title={original ? 'Ubah produk' : 'Tambah produk'} onClose={() => setOpen(false)} busy={busy || uploading}>
      <form className="stack" onSubmit={save}>
        <div className="form-grid">
          <Field label="Nama produk">
            <input required maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
          </Field>
          <Field label="Harga (Rupiah)">
            <input required type="number" min={1} max={1000000000} step={1} value={draft.price || ''} onChange={e => setDraft({ ...draft, price: Number(e.target.value) })} />
          </Field>
          <Field label="Kategori">
            <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>
              <option value="">Tanpa kategori</option>
              {draft.category && !settings.data?.categories.includes(draft.category) && <option>
                {draft.category}
              </option>}
              {settings.data?.categories.map(c => <option key={c}>
                {c}
              </option>)}
            </select>
          </Field>
          <Field label="Stok tersedia" hint="Kosong = tidak dibatasi. Stok berkurang saat pesanan dibuat, termasuk pesanan menunggu pembayaran.">
            <input type="number" min={0} step={1} max={100000000} value={draft.stock ?? ''} onChange={e => setDraft({ ...draft, stock: e.target.value === '' ? null : Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Deskripsi">
          <textarea maxLength={10000} rows={4} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
        </Field>
        <div className="stack">
          <h3>Galeri produk</h3>
          <div className="gallery editor-gallery">
            {draft.images.map((img, i) => <div key={img}>
              <Photo src={img} alt={'Gambar ' + (i + 1)} />
              <button type="button" className="text-button" disabled={uploading} onClick={() => setDraft(d => { const images = d.images.filter(x => x !== img); return { ...d, images, image_url: images[0] || '' }; })}>Hapus foto</button>
            </div>)}
          </div>
          <Field label="Tambah gambar" hint="Maksimal lima foto. JPG/PNG/WebP, maksimal 5 MB per foto.">
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploading || busy || draft.images.length >= 5} onChange={e => { void upload(e.target.files); e.target.value = ''; }} />
          </Field>
        </div>
        <div className="stack">
          <div className="section-heading">
            <h3>Varian warna</h3>
            <button type="button" className="button secondary" disabled={uploading || draft.variants.length >= 30} onClick={() => setDraft(d => ({ ...d, variants: [...d.variants, { name: '', image: '' }] }))}>Tambah varian</button>
          </div>
          {draft.variants.map((v, i) => <div className="variant-editor" key={i}>
            <Field label={'Nama varian ' + (i + 1)}>
              <input required maxLength={100} value={v.name} onChange={e => setDraft(d => ({ ...d, variants: d.variants.map((item, index) => index === i ? { ...item, name: e.target.value } : item) }))} />
            </Field>
            <Photo src={v.image} alt={v.name} />
            <Field label="Foto varian">
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || busy} onChange={e => { void upload(e.target.files, i); e.target.value = ''; }} />
            </Field>
            <button className="text-button danger" type="button" disabled={uploading} onClick={() => setDraft(d => ({ ...d, variants: d.variants.filter((_, n) => n !== i) }))}>Hapus varian</button>
          </div>)}
        </div>
        <label className="check">
          <input type="checkbox" checked={draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} />Produk aktif</label>
        <Message error={error} loading={uploading} />
        <button className="button wide" disabled={busy || uploading}>
          {busy ? 'Menyimpan…' : 'Simpan produk'}
        </button>
      </form>
    </Modal>
  </section>;
}
