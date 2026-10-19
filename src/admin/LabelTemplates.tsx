import { useEffect, useRef, useState } from 'react';
import { getSettings, saveSettings } from '../lib/api';
import { normalizeLabelTemplate, numericLimits, templateDefaults, type LabelTemplate } from '../lib/labelTemplate';
import { shippingLabelHtml, type ShippingLabel } from '../lib/shippingLabel';
import { errorMessage } from '../lib/domain';
import { Field, Message } from '../components/UI';
import { phrase } from '../i18n/runtime';

const labelCopy: Record<string, string> = {
    width: 'Lebar kertas (mm)', height: 'Tinggi kertas (mm)', margin: 'Margin kertas (mm)', padding: 'Padding bagian (mm)',
    fontSize: 'Ukuran teks (px)', headingSize: 'Ukuran judul (px)', lineHeight: 'Jarak baris', border: 'Ketebalan garis (px)',
    logoWidth: 'Lebar logo Biteship (mm)', barcodeHeight: 'Tinggi barcode resi (mm)', moduleWidth: 'Lebar modul barcode (mm)', quietZone: 'Quiet zone (modul per sisi)',
    courierLogo: 'Logo kurir', biteshipLogo: 'Logo Biteship', sender: 'Identitas pengirim', senderPhone: 'Telepon pengirim', recipientPhone: 'Telepon penerima',
    products: 'Daftar barang', notes: 'Catatan', reference: 'Referensi internal', referenceBarcode: 'Barcode referensi opsional', totals: 'Total jumlah / berat', shippingFee: 'Ongkos kirim', routing: 'Kode rute',
};
const labels = Object.defineProperties({}, Object.fromEntries(Object.entries(labelCopy).map(([key, value]) => [key, { enumerable: true, get: () => phrase(value) }]))) as Record<string, string>;
export function demoLabel(courier = 'jnt', long = false): ShippingLabel {
    const contact = { name: 'CONTOH - bukan pelanggan', phone: '0000000000', address: 'Alamat dummy untuk pratinjau', postalCode: '00000', note: 'Data contoh, bukan pengiriman nyata.' };
    return { reference: long ? 'DEMO-' + 'REFERENSI-PANJANG-'.repeat(5) : 'DEMO-001', waybill: 'J00330160962', routing: 'DEMO', courier, service: 'reg', shippingFee: 15000, cod: 0,
        sender: contact, recipient: { ...contact, address: long ? (contact.address + '\n').repeat(8) : contact.address }, note: '',
        items: Array.from({ length: long ? 8 : 1 }, () => ({ name: 'Barang contoh', quantity: 2, weight: 100, length: 10, width: 10, height: 5 })) };
}
export default function LabelTemplates() {
    const [draft, setDraft] = useState<LabelTemplate>({ ...templateDefaults });
    const [saved, setSaved] = useState<LabelTemplate>({ ...templateDefaults });
    const [revision, setRevision] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
    const [error, setError] = useState(''), [message, setMessage] = useState('');
    const [courier, setCourier] = useState('jnt'), [long, setLong] = useState(false), [zoom, setZoom] = useState('fit');
    const host = useRef<HTMLDivElement>(null);
    const [available, setAvailable] = useState(400);
    const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
    async function load() {
        setLoading(true); setError('');
        try {
            const settings = await getSettings();
            const value = normalizeLabelTemplate(settings.shipping_label_template);
            setDraft(value); setSaved(value); setRevision(settings.updated_at);
            setMessage(settings.shipping_label_template == null ? 'Menggunakan bawaan. Jika kolom belum tersedia, jalankan migrasi sebelum menyimpan.' : 'Template tersimpan dimuat.');
        } catch (e) { setError(errorMessage(e)); }
        finally { setLoading(false); }
    }
    useEffect(() => { void load(); }, []);
    useEffect(() => {
        const observer = new ResizeObserver(entries => setAvailable(entries[0].contentRect.width));
        if (host.current) observer.observe(host.current);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);
    let html = '', validation = '', normalized = templateDefaults;
    try { normalized = normalizeLabelTemplate(draft); html = shippingLabelHtml(demoLabel(courier, long), normalized); }
    catch (e) { validation = errorMessage(e); }
    const width = normalized.width * 96 / 25.4;
    const scale = zoom === 'fit' ? Math.min(1, available / width) : Number(zoom);
    function change(key: string, value: unknown) { setDraft(d => ({ ...d, [key]: value })); setMessage(''); }
    async function save() {
        if (busy || validation || !revision) return;
        setBusy(true); setError(''); setMessage('');
        try {
            const value = normalizeLabelTemplate(draft);
            shippingLabelHtml(demoLabel(), value);
            const settings = await saveSettings({ shipping_label_template: value }, revision);
            const confirmed = normalizeLabelTemplate(settings.shipping_label_template);
            setDraft(confirmed); setSaved(confirmed); setRevision(settings.updated_at); setMessage('Template bersama berhasil disimpan. Cetak berikutnya memuat versi terbaru.');
        } catch (e) { setError(errorMessage(e)); }
        finally { setBusy(false); }
    }
    return <section className="stack">
        <h1>Template label pengiriman</h1>
        <p className="muted">Pratinjau lokal langsung dari renderer cetak. Resi, barcode resi, nama dan alamat penerima, layanan serta COD selalu ditampilkan dari provider, tidak bisa diganti di sini.</p>
        <Message error={error} success={message} loading={loading} />
        <div className="actions"><button className="button secondary" disabled={busy || loading} onClick={() => { if (!dirty || window.confirm('Buang perubahan dan muat ulang?')) void load(); }}>Muat ulang</button><span role="status">{dirty ? 'Perubahan belum disimpan' : 'Tidak ada perubahan'}</span></div>
        <div className="label-template-grid">
            <fieldset className="panel stack" disabled={loading || busy || !revision}>
                <legend>Desain bersama toko</legend>
                <Field label="Ukuran kertas"><select value={draft.paper} onChange={e => change('paper', e.target.value)}>{['100x150', '100x100', 'A6', 'custom'].map(p => <option key={p} value={p}>{p === 'custom' ? 'Kustom' : p}</option>)}</select></Field>
                <div className="form-grid">{Object.entries(numericLimits).filter(([key]) => draft.paper === 'custom' || !['width', 'height'].includes(key)).map(([key, [min, max, step]]) => <Field key={key} label={labels[key]} hint={`${min} - ${max}`}><input type="number" min={min} max={max} step={step} value={Number.isFinite(draft[key as keyof LabelTemplate]) ? Number(draft[key as keyof LabelTemplate]) : ''} onChange={e => change(key, e.target.value === '' ? NaN : Number(e.target.value))} /></Field>)}</div>
                <Field label="Susunan kontak"><select value={draft.layout} onChange={e => change('layout', e.target.value)}><option value="columns">Dua kolom</option><option value="stacked">Bertumpuk</option></select></Field>
                <Field label="Perataan resi, referensi dan footer"><select value={draft.alignment} onChange={e => change('alignment', e.target.value)}><option value="left">Kiri</option><option value="center">Tengah</option><option value="right">Kanan</option></select></Field>
                <Field label="Judul tambahan (teks biasa)"><input maxLength={80} value={draft.title} onChange={e => change('title', e.target.value)} /></Field>
                <Field label="Footer tambahan (teks biasa)"><textarea maxLength={180} value={draft.footer} onChange={e => change('footer', e.target.value)} /></Field>
                <h2>Bagian opsional</h2>
                {Object.entries(templateDefaults).filter(([, value]) => typeof value === 'boolean').map(([key]) => <label key={key} className="label-template-toggle"><input type="checkbox" checked={Boolean(draft[key as keyof LabelTemplate])} onChange={e => change(key, e.target.checked)} />{labels[key]}</label>)}
                <Message error={validation} />
                <div className="actions"><button className="button" disabled={!dirty || !!validation} onClick={() => void save()}>{busy ? 'Menyimpan...' : 'Simpan template'}</button><button className="button secondary" onClick={() => { if (window.confirm('Kembalikan draft ke bawaan? Simpan untuk menerapkan.')) { setDraft({ ...templateDefaults }); setMessage('Bawaan dipulihkan ke draft, belum disimpan.'); } }}>Reset bawaan</button><button className="button secondary" disabled={!dirty} onClick={() => { setDraft({ ...saved }); setMessage('Perubahan dibatalkan.'); }}>Batalkan</button></div>
            </fieldset>
            <section className="panel stack label-template-preview" aria-label="Pratinjau label">
                <h2>Pratinjau data dummy</h2>
                <Field label="Kurir contoh (tidak disimpan)"><select value={courier} onChange={e => setCourier(e.target.value)}>{['jnt', 'jne', 'sicepat', 'anteraja', 'pos', 'tiki', 'unknown'].map(c => <option key={c}>{c}</option>)}</select></Field>
                <label className="label-template-toggle"><input type="checkbox" checked={long} onChange={e => setLong(e.target.checked)} />Contoh alamat, barang dan referensi panjang</label>
                <Field label="Zoom layar (tidak mengubah cetak)"><select value={zoom} onChange={e => setZoom(e.target.value)}><option value="fit">Pas lebar</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option></select></Field>
                <p className="muted">{normalized.width} x {normalized.height} mm. Isi panjang dapat berlanjut ke halaman berikutnya. Pratinjau ini mengalir, bukan simulasi pemisahan halaman. Periksa dialog cetak, skala 100%; jangan pilih fit-to-page.</p>
                <div ref={host} className="label-template-canvas">{validation ? <p role="alert">{validation} Pratinjau diblokir.</p> : <div style={{ width: width * scale, height: 850 * scale }}><iframe title="Label dummy - renderer cetak asli" sandbox="" referrerPolicy="no-referrer" srcDoc={html} style={{ width, height: 850, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0, background: 'white' }} /></div>}</div>
                <small>Barcode resi wajib muat tanpa diperkecil. Resi nyata divalidasi lagi sebelum mencetak; contoh yang muat tidak menjamin semua panjang resi muat.</small>
            </section>
        </div>
    </section>;
}