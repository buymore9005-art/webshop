import type { FormEvent } from 'react';
import { useState } from 'react';
import type { Article, BrandGalleryImage, FooterInfo } from '../types';
import { deleteArticle, deleteBrandGalleryImage, deleteFooterInfo, getAdminArticles, getAdminBrandGallery, getAdminFooterInfo, saveArticle, saveBrandGalleryImage, saveFooterInfo, uploadImage } from '../lib/api';
import { errorMessage } from '../lib/domain';
import { useResource } from '../lib/useResource';
import { Field, Message, Modal, Photo } from '../components/UI';

const blankArticle = (): Omit<Article, 'id' | 'created_at' | 'updated_at' | 'published_at'> => ({
    slug: '', title: '', excerpt: '', body: '', cover_image_url: '', status: 'draft',
});
const blankFooter = (): Omit<FooterInfo, 'id'> => ({ title: '', content: '', href: '', sort_order: 0, is_active: true });
const blankGalleryImage = (): Omit<BrandGalleryImage, 'id' | 'created_at' | 'updated_at'> => ({ title: '', caption: '', image_url: '', sort_order: 0, is_active: true });

export default function Content() {
    const [tab, setTab] = useState<'articles' | 'footer' | 'gallery'>('articles');
    const [revision, setRevision] = useState(0);
    const articles = useResource('admin-articles:' + revision, getAdminArticles, 'admin-articles');
    const footer = useResource('admin-footer:' + revision, getAdminFooterInfo, 'admin-footer-info');
    const gallery = useResource('admin-brand-gallery:' + revision, getAdminBrandGallery, 'admin-brand-gallery');
    const [articleOpen, setArticleOpen] = useState(false);
    const [articleId, setArticleId] = useState<string | undefined>();
    const [articleDraft, setArticleDraft] = useState(blankArticle);
    const [footerOpen, setFooterOpen] = useState(false);
    const [footerId, setFooterId] = useState<string | undefined>();
    const [footerDraft, setFooterDraft] = useState(blankFooter);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [galleryId, setGalleryId] = useState<string | undefined>();
    const [galleryDraft, setGalleryDraft] = useState(blankGalleryImage);
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    function editArticle(value?: Article) {
        setArticleId(value?.id);
        setArticleDraft(value ? { slug: value.slug, title: value.title, excerpt: value.excerpt, body: value.body, cover_image_url: value.cover_image_url, status: value.status } : blankArticle());
        setError('');
        setArticleOpen(true);
    }
    function editFooter(value?: FooterInfo) {
        setFooterId(value?.id);
        setFooterDraft(value ? { title: value.title, content: value.content, href: value.href, sort_order: value.sort_order, is_active: value.is_active } : blankFooter());
        setError('');
        setFooterOpen(true);
    }
    function editGalleryImage(value?: BrandGalleryImage) {
        setGalleryId(value?.id);
        setGalleryDraft(value ? { title: value.title, caption: value.caption, image_url: value.image_url, sort_order: value.sort_order, is_active: value.is_active } : blankGalleryImage());
        setError('');
        setGalleryOpen(true);
    }
    async function submitArticle(event: FormEvent) {
        event.preventDefault();
        if (busy || uploading)
            return;
        setBusy(true);
        setError('');
        try {
            await saveArticle({ ...articleDraft, id: articleId });
            setArticleOpen(false);
            setRevision(value => value + 1);
            setMessage('Artikel berhasil disimpan.');
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function submitFooter(event: FormEvent) {
        event.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError('');
        try {
            await saveFooterInfo(footerDraft, footerId);
            setFooterOpen(false);
            setRevision(value => value + 1);
            setMessage('Informasi footer berhasil disimpan.');
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function submitGalleryImage(event: FormEvent) {
        event.preventDefault();
        if (busy || uploading)
            return;
        setBusy(true);
        setError('');
        try {
            await saveBrandGalleryImage(galleryDraft, galleryId);
            setGalleryOpen(false);
            setRevision(value => value + 1);
            setMessage('Foto kolase berhasil disimpan.');
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function removeArticle(value: Article) {
        if (!window.confirm(`Hapus artikel "${value.title}"?`))
            return;
        setError('');
        try {
            await deleteArticle(value.id);
            setRevision(revision + 1);
            setMessage('Artikel dihapus.');
        }
        catch (e) {
            setError(errorMessage(e));
        }
    }
    async function removeFooter(value: FooterInfo) {
        if (!window.confirm(`Hapus informasi footer "${value.title}"?`))
            return;
        setError('');
        try {
            await deleteFooterInfo(value.id);
            setRevision(revision + 1);
            setMessage('Informasi footer dihapus.');
        }
        catch (e) {
            setError(errorMessage(e));
        }
    }
    async function removeGalleryImage(value: BrandGalleryImage) {
        if (!window.confirm(`Hapus foto "${value.title}" dari kolase footer?`))
            return;
        setError('');
        try {
            await deleteBrandGalleryImage(value.id);
            setRevision(revision + 1);
            setMessage('Foto dihapus dari kolase footer.');
        }
        catch (e) {
            setError(errorMessage(e));
        }
    }
    async function uploadCover(file?: File) {
        if (!file || uploading)
            return;
        setUploading(true);
        setError('');
        try {
            const url = await uploadImage(file, 'articles');
            setArticleDraft(value => ({ ...value, cover_image_url: url }));
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setUploading(false);
        }
    }
    async function uploadGalleryPhoto(file?: File) {
        if (!file || uploading)
            return;
        setUploading(true);
        setError('');
        try {
            const url = await uploadImage(file, 'brand-gallery');
            setGalleryDraft(value => ({ ...value, image_url: url }));
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setUploading(false);
        }
    }
    const activeError = error || (tab === 'articles' ? articles.error : tab === 'footer' ? footer.error : gallery.error);
    return <section className="stack">
        <div className="section-heading"><div><h1>Artikel & informasi toko</h1><p className="muted">Kelola artikel, informasi footer, dan showcase portofolio brand.</p></div>
            <button className="button" onClick={() => tab === 'articles' ? editArticle() : tab === 'footer' ? editFooter() : editGalleryImage()}>{tab === 'articles' ? 'Tambah artikel' : tab === 'footer' ? 'Tambah informasi footer' : 'Tambah foto showcase'}</button>
        </div>
        <div className="actions content-tabs" role="tablist" aria-label="Konten toko">
            <button className={'button ' + (tab === 'articles' ? '' : 'secondary')} role="tab" aria-selected={tab === 'articles'} onClick={() => setTab('articles')}>Artikel</button>
            <button className={'button ' + (tab === 'footer' ? '' : 'secondary')} role="tab" aria-selected={tab === 'footer'} onClick={() => setTab('footer')}>Informasi footer</button>
            <button className={'button ' + (tab === 'gallery' ? '' : 'secondary')} role="tab" aria-selected={tab === 'gallery'} onClick={() => setTab('gallery')}>Showcase / portofolio</button>
        </div>
        <Message error={activeError} success={message} loading={tab === 'articles' ? articles.loading : tab === 'footer' ? footer.loading : gallery.loading} />
        {tab === 'articles' && <p className="content-admin-hint">Kelola artikel publik dan draf toko di sini. Artikel terbit tidak otomatis mengubah showcase portofolio footer.</p>}
        {tab === 'articles' && <div className="admin-content-list">
            {articles.data?.map(article => <article className="panel content-admin-card" key={article.id}>
                {article.cover_image_url && <Photo src={article.cover_image_url} alt="" className="content-admin-cover" />}
                <div className="stack"><div className="split"><h2>{article.title}</h2><span className={'status ' + (article.status === 'published' ? 'paid' : 'pending')}>{article.status === 'published' ? 'Terbit' : 'Draf'}</span></div>
                    <small>/{article.slug} · diperbarui {new Date(article.updated_at).toLocaleDateString('id-ID')}</small>
                    <p>{article.excerpt || 'Tanpa ringkasan.'}</p>
                    <div className="actions"><button className="button secondary" onClick={() => editArticle(article)}>Ubah</button><button className="text-button danger" onClick={() => void removeArticle(article)}>Hapus</button></div>
                </div>
            </article>)}
            {!articles.loading && !articles.error && !articles.data?.length && <p className="empty">Belum ada artikel. Artikel draf tidak ditampilkan di toko.</p>}
        </div>}
        {tab === 'footer' && <div className="admin-content-list">
            {footer.data?.map(item => <article className="panel stack" key={item.id}>
                <div className="split"><h2>{item.title}</h2><span className={'status ' + (item.is_active ? 'paid' : 'cancelled')}>{item.is_active ? 'Tampil' : 'Disembunyikan'}</span></div>
                {item.content && <p className="preserve-text">{item.content}</p>}
                {item.href && <a href={item.href} target={item.href.startsWith('https://') ? '_blank' : undefined} rel={item.href.startsWith('https://') ? 'noopener noreferrer' : undefined}>{item.href}</a>}
                <small>Urutan footer: {item.sort_order}</small>
                <div className="actions"><button className="button secondary" onClick={() => editFooter(item)}>Ubah</button><button className="text-button danger" onClick={() => void removeFooter(item)}>Hapus</button></div>
            </article>)}
            {!footer.loading && !footer.error && !footer.data?.length && <p className="empty">Belum ada informasi footer. Tambahkan kebijakan, kontak, jam operasional, atau tautan toko.</p>}
        </div>}
        {tab === 'gallery' && <>
            <p className="content-admin-hint">Unggah dan atur foto proses produksi, model, hasil kerja, atau preview produk. Showcase terpisah tampil di atas informasi footer dan menampilkan hingga lima foto aktif dengan urutan terendah. JPG, PNG, atau WebP maksimal 5 MB per foto.</p>
            <div className="admin-gallery-grid">
                {gallery.data?.map(image => <article className="panel admin-gallery-card" key={image.id}>
                    <Photo src={image.image_url} alt={image.title} className="admin-gallery-photo" />
                    <div className="stack"><div className="split"><h2>{image.title}</h2><span className={'status ' + (image.is_active ? 'paid' : 'cancelled')}>{image.is_active ? 'Tampil di showcase' : 'Disembunyikan'}</span></div>
                        {image.caption && <p>{image.caption}</p>}
                        <small>Urutan: {image.sort_order}</small>
                        <div className="actions"><button className="button secondary" onClick={() => editGalleryImage(image)}>Ubah</button><button className="text-button danger" onClick={() => void removeGalleryImage(image)}>Hapus</button></div>
                    </div>
                </article>)}
                {!gallery.loading && !gallery.error && !gallery.data?.length && <p className="empty">Belum ada foto. Tambahkan potret produksi atau koleksi untuk menampilkannya di footer.</p>}
            </div>
        </>}

        <Modal open={articleOpen} title={articleId ? 'Ubah artikel' : 'Artikel baru'} onClose={() => setArticleOpen(false)} busy={busy || uploading}>
            <form className="stack" onSubmit={submitArticle}>
                <Field label="Judul artikel"><input required minLength={3} maxLength={180} value={articleDraft.title} onChange={e => setArticleDraft({ ...articleDraft, title: e.target.value })} /></Field>
                <Field label="Slug URL" hint="Huruf kecil, angka, dan tanda hubung; kosongkan untuk memakai judul."><input maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={articleDraft.slug} onChange={e => setArticleDraft({ ...articleDraft, slug: e.target.value })} /></Field>
                <Field label="Ringkasan"><textarea maxLength={500} rows={3} value={articleDraft.excerpt} onChange={e => setArticleDraft({ ...articleDraft, excerpt: e.target.value })} /></Field>
                <Field label="Isi artikel" hint="Teks biasa; baris baru dipertahankan. HTML/script tidak dijalankan."><textarea required minLength={1} maxLength={30000} rows={12} value={articleDraft.body} onChange={e => setArticleDraft({ ...articleDraft, body: e.target.value })} /></Field>
                <Photo src={articleDraft.cover_image_url} alt="Sampul artikel" className="content-admin-cover" />
                <Field label="Unggah foto sampul"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || busy} onChange={e => { void uploadCover(e.target.files?.[0]); e.target.value = ''; }} /></Field>
                <Field label="Atau URL foto HTTPS"><input type="url" maxLength={2048} value={articleDraft.cover_image_url} onChange={e => setArticleDraft({ ...articleDraft, cover_image_url: e.target.value })} /></Field>
                <Field label="Status publikasi"><select value={articleDraft.status} onChange={e => setArticleDraft({ ...articleDraft, status: e.target.value as Article['status'] })}><option value="draft">Draf</option><option value="published">Terbit</option></select></Field>
                <Message error={error} />
                <button className="button" disabled={busy || uploading}>{busy ? 'Menyimpan…' : uploading ? 'Mengunggah…' : 'Simpan artikel'}</button>
            </form>
        </Modal>
        <Modal open={footerOpen} title={footerId ? 'Ubah informasi footer' : 'Tambah informasi footer'} onClose={() => setFooterOpen(false)} busy={busy}>
            <form className="stack" onSubmit={submitFooter}>
                <Field label="Judul"><input required minLength={2} maxLength={100} value={footerDraft.title} onChange={e => setFooterDraft({ ...footerDraft, title: e.target.value })} /></Field>
                <Field label="Informasi tambahan" hint="Opsional jika tautan diisi. HTML tidak dijalankan."><textarea maxLength={1000} rows={4} value={footerDraft.content} onChange={e => setFooterDraft({ ...footerDraft, content: e.target.value })} /></Field>
                <Field label="Tautan HTTPS atau path internal toko" hint="Contoh: https://example.com atau /?view=articles. Kosongkan untuk teks saja."><input type="text" maxLength={2048} value={footerDraft.href} onChange={e => setFooterDraft({ ...footerDraft, href: e.target.value })} /></Field>
                <Field label="Urutan tampilan"><input type="number" step={1} value={footerDraft.sort_order} onChange={e => setFooterDraft({ ...footerDraft, sort_order: Number(e.target.value) })} /></Field>
                <label className="check"><input type="checkbox" checked={footerDraft.is_active} onChange={e => setFooterDraft({ ...footerDraft, is_active: e.target.checked })} />Tampilkan di toko</label>
                <Message error={error} />
                <button className="button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan informasi footer'}</button>
            </form>
        </Modal>
        <Modal open={galleryOpen} title={galleryId ? 'Ubah foto kolase' : 'Tambah foto kolase'} onClose={() => setGalleryOpen(false)} busy={busy || uploading}>
            <form className="stack" onSubmit={submitGalleryImage}>
                <Field label="Judul foto / teks alternatif"><input required minLength={2} maxLength={100} value={galleryDraft.title} onChange={e => setGalleryDraft({ ...galleryDraft, title: e.target.value })} /></Field>
                <Field label="Keterangan singkat" hint="Opsional; ditampilkan di atas foto kolase. Maksimal 180 karakter."><input maxLength={180} value={galleryDraft.caption} onChange={e => setGalleryDraft({ ...galleryDraft, caption: e.target.value })} /></Field>
                <Photo src={galleryDraft.image_url} alt={galleryDraft.title || 'Pratinjau foto kolase'} className="admin-gallery-preview" />
                <Field label="Unggah foto"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || busy} onChange={e => { void uploadGalleryPhoto(e.target.files?.[0]); e.target.value = ''; }} /></Field>
                <Field label="Atau URL foto HTTPS"><input type="url" maxLength={2048} value={galleryDraft.image_url} onChange={e => setGalleryDraft({ ...galleryDraft, image_url: e.target.value })} /></Field>
                <Field label="Urutan tampilan"><input type="number" step={1} value={galleryDraft.sort_order} onChange={e => setGalleryDraft({ ...galleryDraft, sort_order: Number(e.target.value) })} /></Field>
                <label className="check"><input type="checkbox" checked={galleryDraft.is_active} onChange={e => setGalleryDraft({ ...galleryDraft, is_active: e.target.checked })} />Tampilkan di showcase footer</label>
                <Message error={error} />
                <button className="button" disabled={busy || uploading}>{busy ? 'Menyimpan…' : uploading ? 'Mengunggah…' : 'Simpan foto'}</button>
            </form>
        </Modal>
    </section>;
}
