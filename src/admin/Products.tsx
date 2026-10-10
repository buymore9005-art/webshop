import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { Product } from '../types';
import { adjustInventory, getInventoryMovements, getProducts, getSettings, importProducts, saveProduct, uploadImage } from '../lib/api';
import { errorMessage, money, parseProductCsv } from '../lib/domain';
import type { ProductImportRow } from '../lib/domain';
import { useResource } from '../lib/useResource';
import { Field, Message, Modal, Pagination, Photo } from '../components/UI';
type Draft = Pick<Product, 'title' | 'price' | 'description' | 'category' | 'image_url' | 'images' | 'variants' | 'stock' | 'stock_alert_threshold' | 'weight_grams' | 'is_active'>;
type InventoryFilter = 'all' | 'low' | 'out' | 'unlimited';
type InventoryEntry = { product: Product; variant: string; stock: number | null; threshold: number };
const blank = (): Draft => ({ title: '', price: 0, description: '', category: '', image_url: '', images: [], variants: [], stock: null, stock_alert_threshold: 5, weight_grams: 0, is_active: true });
export default function Products() {
  const [page, setPage] = useState(0), [search, setSearch] = useState(''), [revision, setRevision] = useState(0);
  const result = useResource(JSON.stringify([page, search, revision]), s => getProducts({ page, search, category: '', sort: 'newest', admin: true }, s), JSON.stringify(['admin-products', page, search]));
  const settings = useResource('product-categories', () => getSettings(), 'store-settings');
  const [view, setView] = useState<'products' | 'inventory'>('products');
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>('all');
  const [open, setOpen] = useState(false), [original, setOriginal] = useState<Product | undefined>(), [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [showImport, setShowImport] = useState(false), [importRows, setImportRows] = useState<ProductImportRow[]>([]);
  const [stockTarget, setStockTarget] = useState<InventoryEntry | null>(null);
  const [stockDelta, setStockDelta] = useState('1'), [stockReason, setStockReason] = useState('Penerimaan stok'), [stockNote, setStockNote] = useState('');
  const [stockHistory, setStockHistory] = useState<Awaited<ReturnType<typeof getInventoryMovements>>>([]);
  const [stockHistoryError, setStockHistoryError] = useState('');
  function edit(p?: Product) { setOriginal(p); setDraft(p ? { title: p.title, price: p.price, description: p.description, category: p.category, image_url: p.image_url, images: [...(p.images || [])], variants: (p.variants || []).map(v => ({ ...v, stock: v.stock ?? 0, low_stock_threshold: v.low_stock_threshold ?? 5 })), stock: p.stock, stock_alert_threshold: p.stock_alert_threshold ?? 5, weight_grams: p.weight_grams || 0, is_active: p.is_active } : blank()); setOpen(true); setError(''); }
  const inventoryEntries = useMemo(() => (result.data?.rows || []).flatMap(product => product.variants.length
    ? product.variants.map(variant => ({ product, variant: variant.name, stock: variant.stock ?? 0, threshold: variant.low_stock_threshold ?? 5 }))
    : [{ product, variant: '', stock: product.stock, threshold: product.stock_alert_threshold ?? 5 }]), [result.data?.rows]);
  const visibleInventory = inventoryEntries.filter(entry => inventoryFilter === 'all'
    || (inventoryFilter === 'out' && entry.stock === 0)
    || (inventoryFilter === 'low' && entry.stock !== null && entry.stock > 0 && entry.stock <= entry.threshold)
    || (inventoryFilter === 'unlimited' && entry.stock === null));
  useEffect(() => {
    if (!stockTarget)
      return;
    let active = true;
    setStockHistory([]);
    setStockHistoryError('');
    void getInventoryMovements(stockTarget.product.id, stockTarget.variant).then(rows => {
      if (active)
        setStockHistory(rows);
    }).catch(e => {
      if (active)
        setStockHistoryError(errorMessage(e));
    });
    return () => { active = false; };
  }, [stockTarget?.product.id, stockTarget?.variant]);
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
  async function submitStockAdjustment(event: FormEvent) {
    event.preventDefault();
    if (!stockTarget || busy)
      return;
    const count = Number(stockDelta);
    if (!Number.isSafeInteger(count) || count < 1 || count > 100000000) {
      setError('Jumlah penyesuaian harus bilangan bulat 1–100.000.000.');
      return;
    }
    const negative = stockReason === 'Pengurangan stok' || stockReason === 'Stok rusak';
    const reason = stockNote.trim() ? `${stockReason}: ${stockNote.trim()}` : stockReason;
    setBusy(true);
    setError('');
    try {
      await adjustInventory(stockTarget.product.id, stockTarget.variant, negative ? -count : count, reason);
      const label = `${stockTarget.product.title}${stockTarget.variant ? ` (${stockTarget.variant})` : ''}`;
      setStockTarget(null);
      setStockNote('');
      setRevision(value => value + 1);
      setMessage(`Stok ${label} diperbarui; perubahan dicatat di riwayat.`);
    }
    catch (e) {
      setError(errorMessage(e));
    }
    finally {
      setBusy(false);
    }
  }
  function downloadTemplate() {
    const csv = '\uFEFFtitle,price,description,category,image_url,stock,weight_grams,is_active\r\nTas contoh,125000,"Deskripsi produk",Tas,,10,500,true\r\n';
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
      <div><h1>Produk & katalog</h1><p className="muted">Kelola katalog, stok varian, dan pergerakan inventaris.</p></div>
      {view === 'products' && <div className="actions">
        <button className="button secondary" onClick={() => { setShowImport(value => !value); setImportRows([]); setError(''); }}>Impor CSV</button>
        <button className="button" onClick={() => edit()}>Tambah produk</button>
      </div>}
    </div>
    <Message error={open ? '' : error || result.error} success={message} loading={result.loading} />
    <div className="actions content-tabs" role="tablist" aria-label="Katalog dan inventaris">
      <button className={'button ' + (view === 'products' ? '' : 'secondary')} role="tab" aria-selected={view === 'products'} onClick={() => setView('products')}>Produk & katalog</button>
      <button className={'button ' + (view === 'inventory' ? '' : 'secondary')} role="tab" aria-selected={view === 'inventory'} onClick={() => setView('inventory')}>Manajemen stok</button>
    </div>
    {view === 'products' && showImport && <section className="panel stack">
      <div><h2>Impor produk dari CSV</h2><p className="muted">Maksimal 250 produk dan 1 MB per file. Harga dalam Rupiah. Seluruh baris divalidasi sebelum dikirim sebagai satu operasi database.</p></div>
      <p className="import-format"><code>title,price,description,category,image_url,stock,weight_grams,is_active</code><br />Kolom wajib: title, price. Kolom opsional: description, category, image_url, stock, weight_grams, is_active. Masukkan berat satu produk dalam gram (0 = belum diisi; isi berat aktual sebelum integrasi tarif kurir). Stok kosong berarti tidak dibatasi; URL gambar harus HTTPS. Teks berkoma/baris baru harus dibungkus tanda kutip CSV. Impor menambahkan produk baru tanpa foto galeri atau varian.</p>
      <button type="button" className="text-button" onClick={downloadTemplate}>Unduh template CSV</button>
      <Field label="Pilih file CSV">
        <input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { void stageImport(event.target.files?.[0]); event.target.value = ''; }} />
      </Field>
      {!!importRows.length && <>
        <p role="status">{importRows.length} produk valid; pratinjau maksimal 10 baris.</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Nama produk</th><th>Harga</th><th>Kategori</th><th>Stok</th><th>Berat (g)</th></tr></thead><tbody>
          {importRows.slice(0, 10).map((row, index) => <tr key={index}><td data-label="Nama produk">{row.title}</td><td data-label="Harga">{money(row.price)}</td><td data-label="Kategori">{row.category || 'Tanpa kategori'}</td><td data-label="Stok">{row.stock === null ? 'Tidak dibatasi' : row.stock}</td><td data-label="Berat (g)">{row.weight_grams || 'Belum diisi'}</td></tr>)}
        </tbody></table></div>
        <button className="button" disabled={busy} onClick={() => void runImport()}>{busy ? 'Mengimpor…' : `Impor ${importRows.length} produk`}</button>
      </>}
    </section>}
    <div className="panel">
      <Field label="Cari produk">
        <input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Nama produk…" />
      </Field>
    </div>
    {view === 'inventory' && <>
      <div className="inventory-summary-grid" aria-label="Ringkasan stok di halaman ini">
        <div className="panel"><small>Varian / produk dilacak</small><strong>{inventoryEntries.filter(item => item.stock !== null).length}</strong></div>
        <div className="panel"><small>Stok rendah</small><strong>{inventoryEntries.filter(item => item.stock !== null && item.stock > 0 && item.stock <= item.threshold).length}</strong></div>
        <div className="panel"><small>Stok habis</small><strong>{inventoryEntries.filter(item => item.stock === 0).length}</strong></div>
        <div className="panel"><small>Stok tak terbatas</small><strong>{inventoryEntries.filter(item => item.stock === null).length}</strong></div>
      </div>
      <div className="actions inventory-filters" role="group" aria-label="Filter kondisi stok">
        {([
          ['all', 'Semua'],
          ['low', 'Stok rendah'],
          ['out', 'Habis'],
          ['unlimited', 'Tak terbatas'],
        ] as const).map(([value, label]) => <button key={value} className={'button ' + (inventoryFilter === value ? '' : 'secondary')} aria-pressed={inventoryFilter === value} onClick={() => setInventoryFilter(value)}>{label}</button>)}
      </div>
      <div className="inventory-list">
        {visibleInventory.map(entry => <article className="panel inventory-row" key={entry.product.id + '|' + entry.variant}>
          <Photo src={entry.variant ? entry.product.variants.find(item => item.name === entry.variant)?.image || entry.product.image_url : entry.product.image_url} alt={entry.product.title} className="inventory-photo" />
          <div className="inventory-product"><strong>{entry.product.title}</strong><span>{entry.product.category || 'Tanpa kategori'}{entry.variant ? ` · ${entry.variant}` : ' · Produk tanpa varian'}</span><small>{entry.product.is_active ? 'Aktif di katalog' : 'Nonaktif'}</small></div>
          <div className="inventory-quantity"><span className={'inventory-stock-status ' + (entry.stock === 0 ? 'out' : entry.stock !== null && entry.stock <= entry.threshold ? 'low' : '')}>{entry.stock === null ? 'Tidak dibatasi' : entry.stock === 0 ? 'Habis' : entry.stock <= entry.threshold ? 'Stok rendah' : 'Tersedia'}</span><strong>{entry.stock === null ? '∞' : entry.stock.toLocaleString('id-ID')}</strong><small>{entry.stock === null ? 'unit' : `unit · peringatan ≤ ${entry.threshold}`}</small></div>
          <div className="actions inventory-actions">
            {entry.stock === null
              ? <button className="button secondary" disabled={busy} onClick={() => edit(entry.product)}>Atur stok</button>
              : <button className="button secondary" disabled={busy} onClick={() => { setStockTarget(entry); setStockDelta('1'); setStockReason('Penerimaan stok'); setError(''); }}>Penyesuaian / riwayat</button>}
            <button className="text-button" disabled={busy} onClick={() => edit(entry.product)}>Detail</button>
          </div>
        </article>)}
        {!result.loading && !result.error && !visibleInventory.length && <p className="empty">{inventoryFilter === 'all' ? 'Belum ada produk untuk dikelola.' : 'Tidak ada item stok dengan filter ini pada halaman saat ini.'}</p>}
        <p className="muted inventory-page-note">Ringkasan berlaku untuk halaman katalog yang sedang dibuka. Gunakan pencarian dan paginasi untuk produk lainnya.</p>
      </div>
    </>}
    {view === 'products' && <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Produk</th>
            <th>Kategori / varian</th>
            <th>Harga / stok / berat</th>
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
                {p.variants.length ? p.variants.map(variant => `${variant.name}: ${variant.stock === null ? '∞' : variant.stock ?? 0}`).join(' · ') : p.stock === null ? 'Stok tidak dibatasi' : 'Stok tersedia: ' + p.stock}
              </small>
              <small>Berat: {p.weight_grams ? `${p.weight_grams} g` : 'Belum diisi'}</small>
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
    </div>}
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
          {!draft.variants.length ? <>
            <Field label="Stok tersedia" hint="Kosong = tidak dibatasi. Stok berkurang saat pesanan dibuat, termasuk pesanan menunggu pembayaran.">
              <input type="number" min={0} step={1} max={100000000} value={draft.stock ?? ''} onChange={e => setDraft({ ...draft, stock: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Peringatan stok rendah saat sisa" hint="Status stok rendah muncul pada jumlah ini atau lebih kecil.">
              <input type="number" min={0} max={100000000} step={1} value={draft.stock_alert_threshold} onChange={e => setDraft({ ...draft, stock_alert_threshold: Number(e.target.value) })} />
            </Field>
          </> : <p className="content-admin-hint form-grid-wide">Produk ber-varian memakai stok terpisah untuk setiap varian. Atur stok dan batas peringatan pada masing-masing varian.</p>}
          <Field label="Berat satu produk (gram)" hint="Masukkan berat aktual. 0 berarti belum diketahui dan tidak dapat dipakai untuk menghitung tarif kurir.">
            <input required type="number" min={0} max={100000000} step={1} value={draft.weight_grams} onChange={e => setDraft({ ...draft, weight_grams: e.target.value === '' ? 0 : Number(e.target.value) })} />
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
            <button type="button" className="button secondary" disabled={uploading || draft.variants.length >= 30} onClick={() => setDraft(d => ({ ...d, stock: d.variants.length ? d.stock : 0, variants: [...d.variants, { name: '', image: '', stock: 0, low_stock_threshold: 5 }] }))}>Tambah varian</button>
          </div>
          {draft.variants.map((v, i) => <div className="variant-editor" key={i}>
            <Field label={'Nama varian ' + (i + 1)}>
              <input required maxLength={100} value={v.name} onChange={e => setDraft(d => ({ ...d, variants: d.variants.map((item, index) => index === i ? { ...item, name: e.target.value } : item) }))} />
            </Field>
            <Photo src={v.image} alt={v.name} />
            <Field label="Foto varian">
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || busy} onChange={e => { void upload(e.target.files, i); e.target.value = ''; }} />
            </Field>
            <Field label="Stok varian" hint="0 = habis; kosong = stok tidak dibatasi.">
              <input type="number" min={0} max={100000000} step={1} value={v.stock ?? ''} onChange={e => setDraft(d => ({ ...d, variants: d.variants.map((item, index) => index === i ? { ...item, stock: e.target.value === '' ? null : Number(e.target.value) } : item) }))} />
            </Field>
            <Field label="Peringatan stok rendah">
              <input type="number" min={0} max={100000000} step={1} value={v.low_stock_threshold ?? 5} onChange={e => setDraft(d => ({ ...d, variants: d.variants.map((item, index) => index === i ? { ...item, low_stock_threshold: Number(e.target.value) } : item) }))} />
            </Field>
            <button className="text-button danger" type="button" disabled={uploading} onClick={() => setDraft(d => { const variants = d.variants.filter((_, n) => n !== i); return { ...d, stock: variants.length ? d.stock : 0, variants }; })}>Hapus varian</button>
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
    <Modal open={!!stockTarget} title="Penyesuaian stok & riwayat" onClose={() => !busy && setStockTarget(null)} busy={busy}>
      {stockTarget && <form className="stack" onSubmit={submitStockAdjustment}>
        <div className="panel inventory-adjust-current"><span>{stockTarget.product.title}{stockTarget.variant ? ` · ${stockTarget.variant}` : ''}</span><strong>{stockTarget.stock === null ? 'Tidak dibatasi' : `${stockTarget.stock.toLocaleString('id-ID')} unit saat ini`}</strong></div>
        <Field label="Jenis penyesuaian">
          <select value={stockReason} onChange={e => setStockReason(e.target.value)}>
            <option>Penerimaan stok</option><option>Pengurangan stok</option><option>Stok rusak</option><option>Retur pelanggan</option><option>Koreksi stok</option>
          </select>
        </Field>
        <Field label="Jumlah unit" hint={stockReason === 'Pengurangan stok' || stockReason === 'Stok rusak' ? 'Jumlah mengurangi stok; Supabase menolak hasil di bawah nol.' : 'Jumlah ditambahkan ke stok.'}>
          <input required type="number" min={1} max={100000000} step={1} value={stockDelta} onChange={e => setStockDelta(e.target.value)} />
        </Field>
        <Field label="Catatan" hint="Opsional; jenis penyesuaian dan catatan disimpan di audit inventaris.">
          <textarea maxLength={160} rows={2} value={stockNote} onChange={e => setStockNote(e.target.value)} />
        </Field>
        <Message error={error} />
        <button className="button" disabled={busy}>{busy ? 'Menyimpan…' : 'Catat penyesuaian stok'}</button>
        <section className="stack inventory-history">
          <h3>Riwayat perubahan terbaru</h3>
          {stockHistoryError && <Message error={stockHistoryError} />}
          {!stockHistoryError && !stockHistory.length && <p className="muted">Belum ada penyesuaian yang tercatat.</p>}
          {!!stockHistory.length && <div className="table-wrap"><table className="data-table"><thead><tr><th>Waktu</th><th>Perubahan</th><th>Sisa stok</th><th>Alasan</th></tr></thead><tbody>
            {stockHistory.map(movement => <tr key={movement.id}><td data-label="Waktu">{new Date(movement.created_at).toLocaleString('id-ID')}</td><td data-label="Perubahan">{movement.delta > 0 ? '+' : ''}{movement.delta}</td><td data-label="Sisa stok">{movement.stock_after}</td><td data-label="Alasan">{movement.reason}</td></tr>)}
          </tbody></table></div>}
        </section>
      </form>}
    </Modal>
  </section>;
}
