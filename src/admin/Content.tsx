import type { FormEvent } from 'react';
import { useState } from 'react';
import type { Article, FooterInfo } from '../types';
import { deleteArticle, deleteFooterInfo, getAdminArticles, getAdminFooterInfo, saveArticle, saveFooterInfo, uploadImage } from '../lib/api';
import { errorMessage } from '../lib/domain';
import { useResource } from '../lib/useResource';
import { Field, Message, Modal, Photo } from '../components/UI';

const blankArticle = (): Omit<Article, 'id' | 'created_at' | 'updated_at' | 'published_at'> => ({
    slug: '', title: '', excerpt: '', body: '', cover_image_url: '', status: 'draft',
});
const blankFooter = (): Omit<FooterInfo, 'id'> => ({ title: '', content: '', href: '', sort_order: 0, is_active: true });

export default function Content() {
    const [tab, setTab] = useState<'articles' | 'footer'>('articles');
    const [revision, setRevision] = useState(0);
    const articles = useResource('admin-articles:' + revision, getAdminArticles, 'admin-articles');
    const footer = useResource('admin-footer:' + revision, getAdminFooterInfo, 'admin-footer-info');
    const [articleOpen, setArticleOpen] = useState(false);
    const [articleId, setArticleId] = useState<string | undefined>();
    const [articleDraft, setArticleDraft] = useState(blankArticle);
    const [footerOpen, setFooterOpen] = useState(false);
    const [footerId, setFooterId] = useState<string | undefined>();
    const [footerDraft, setFooterDraft] = useState(blankFooter);
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
    const activeError = error || (tab === 'articles' ? articles.error : footer.error);
    const footerStory = articles.data?.filter(article => article.status === 'published' && article.cover_image_url)
        .sort((a, b) => Date.parse(b.published_at || '') - Date.parse(a.published_at || ''))[0];
    return <section className="stack">
        <div className="section-heading"><div><h1>Artikel & informasi toko</h1><p className="muted">Kelola artikel publik dan isi tambahan pada footer toko.</p></div>
            <button className="button" onClick={() => tab === 'articles' ? editArticle() : editFooter()}>{tab === 'articles' ? 'Tambah artikel' : 'Tambah informasi footer'}</button>
        </div>
        <div className="actions content-tabs" role="tablist" aria-label="Konten toko">
            <button className={'button ' + (tab === 'articles' ? '' : 'secondary')} role="tab" aria-selected={tab === 'articles'} onClick={() => setTab('articles')}>Artikel</button>
            <button className={'button ' + (tab === 'footer' ? '' : 'secondary')} role="tab" aria-selected={tab === 'footer'} onClick={() => setTab('footer')}>Informasi footer</button>
        </div>
        <Message error={activeError} success={message} loading={tab === 'articles' ? articles.loading : footer.loading} />
        {tab === 'articles' && <p className="content-admin-hint">Artikel terbit terbaru yang memiliki foto sampul otomatis tampil sebagai cerita brand di footer. Kelola foto, judul, ringkasan, dan isi cerita dari daftar artikel ini.</p>}
        {tab === 'articles' && <div className="admin-content-list">
            {articles.data?.map(article => <article className="panel content-admin-card" key={article.id}>
                {article.cover_image_url && <Photo src={article.cover_image_url} alt="" className="content-admin-cover" />}
                <div className="stack"><div className="split"><h2>{article.title}</h2><div className="actions"><span className={'status ' + (article.status === 'published' ? 'paid' : 'pending')}>{article.status === 'published' ? 'Terbit' : 'Draf'}</span>{footerStory?.id === article.id && <span className="status">Cerita footer</span>}</div></div>
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
    </section>;
}
