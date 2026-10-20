import type { FormEvent } from 'react';
import { ShipmentStatus } from '../components/ShipmentStatus';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Article, Product } from '../types';
import { client } from '../../supabaseClient';
import { CUSTOMER_ORDER_PAGE_SIZE, getCustomerOrderHistory, getPublishedArticle, getPublishedArticles } from '../lib/api';
import { errorMessage, fulfillmentLabels, money, orderLabels } from '../lib/domain';
import type { CustomerOrderHistory } from '../types';
import { useResource } from '../lib/useResource';
import { Field, Message, Pagination, Photo } from '../components/UI';

export function CustomerAccount({ session, loading, sessionError, onOrders }: { session: Session | null; loading: boolean; sessionError: string; onOrders: () => void }) {
    const [registering, setRegistering] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            if (registering) {
                if (password.length < 12)
                    throw new Error('Gunakan password minimal 12 karakter.');
                const { data, error: authError } = await client().auth.signUp({ email: email.trim(), password });
                if (authError)
                    throw authError;
                if (!data.session)
                    throw new Error('Pendaftaran tersimpan, tetapi Supabase meminta verifikasi email. Untuk pendaftaran langsung, aktifkan Auto Confirm Email pada pengaturan Auth project.');
                setMessage('Akun berhasil dibuat dan Anda sudah masuk.');
            }
            else {
                const { error: authError } = await client().auth.signInWithPassword({ email: email.trim(), password });
                if (authError)
                    throw authError;
            }
            setPassword('');
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function signOut() {
        try {
            const { error: authError } = await client().auth.signOut();
            if (authError)
                throw authError;
            setError('');
        }
        catch (e) {
            setError(errorMessage(e));
        }
    }
    if (loading)
        return <section className="container section"><Message loading /></section>;
    if (!session)
        return <section className="container section">
            <div className="panel auth-panel customer-auth-panel">
                <h1>{registering ? 'Buat akun pelanggan' : 'Masuk ke akun pelanggan'}</h1>
                <Message error={sessionError || error} success={message} />
                <form className="stack" onSubmit={submit}>
                    <Field label="Email"><input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
                    <Field label="Password" hint={registering ? 'Minimal 12 karakter. Pendaftaran memerlukan Supabase Auto Confirm Email.' : undefined}>
                        <input type="password" required minLength={registering ? 12 : 1} autoComplete={registering ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />
                    </Field>
                    <button className="button" disabled={busy}>{busy ? 'Memproses…' : registering ? 'Buat akun' : 'Masuk'}</button>
                </form>
                <button className="text-button" type="button" onClick={() => { setRegistering(value => !value); setError(''); setMessage(''); }}>
                    {registering ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Buat akun'}
                </button>
            </div>
        </section>;
    return <section className="container section stack">
        <div className="section-heading">
            <div><p className="eyebrow">Akun pelanggan</p><h1>Halo, {session.user.email}</h1></div>
            <button className="button secondary" onClick={() => void signOut()}>Keluar</button>
        </div>
        <Message error={sessionError || error} />
        <div className="panel stack"><h2>Profil pelanggan</h2><p>Email: {session.user.email}</p><button className="button secondary" onClick={onOrders}>Lihat pesanan saya</button></div>
    </section>;
}

export function CustomerOrders({ session, loading, sessionError, onAccount, onReceipt }: {
    session: Session | null; loading: boolean; sessionError: string;
    onAccount: () => void; onReceipt: (id: string) => void;
}) {
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState<{ rows: CustomerOrderHistory[]; count: number } | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        if (loading || !session) return;
        const controller = new AbortController();
        setBusy(true);
        setError('');
        setResult(null);
        void getCustomerOrderHistory(page, controller.signal).then(data => {
            if (controller.signal.aborted) return;
            const lastPage = Math.max(0, Math.ceil(data.count / CUSTOMER_ORDER_PAGE_SIZE) - 1);
            if (page > lastPage) { setPage(lastPage); return; }
            setResult(data);
            setBusy(false);
        }).catch(e => {
            if (!controller.signal.aborted) { setError(errorMessage(e)); setBusy(false); }
        });
        return () => controller.abort();
    }, [session?.user.id, loading, page, revision]);
    function changePage(next: number) { setResult(null); setBusy(true); setPage(next); }
    return <section className="container section stack customer-orders">
        <div className="section-heading"><div><p className="eyebrow">Riwayat pesanan</p><h1>Pesanan saya</h1></div>
            {session && <button className="button secondary" disabled={busy || loading} onClick={() => { setBusy(true); setRevision(value => value + 1); }}>Perbarui</button>}
        </div>
        <div className="panel stack"><h2>Bukti pesanan & pembayaran</h2></div>
        <Message error={sessionError || error} />
        {loading ? <p role="status">Memuat akun...</p> : !session ? <div className="panel stack"><p>Masuk untuk melihat seluruh riwayat pesanan akun Anda.</p><button className="button" onClick={onAccount}>Masuk ke akun</button></div> : <>
            <p>Riwayat ini hanya memuat pesanan yang dibuat saat masuk ke akun ini. Pesanan tamu tidak otomatis ditautkan ke akun.</p>
            {busy && <p role="status">Memuat riwayat pesanan...</p>}
            {!busy && error && <button className="button secondary" onClick={() => { setBusy(true); setRevision(value => value + 1); }}>Coba kembali</button>}
            {!busy && result?.count === 0 && <p className="empty">Belum ada pesanan di akun ini.</p>}
            {!busy && result && <>
                <p className="muted" role="status">{result.count} pesanan · Halaman {page + 1}</p>
                <div className="customer-order-list">{result.rows.map(order => <article className="panel stack customer-order-card" key={order.id}>
                    <header className="customer-order-heading"><div><h2>{order.order_number}</h2><time dateTime={order.created_at}>{new Date(order.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</time></div>
                        <div className="customer-order-statuses"><span>Pembayaran: <span className={'status ' + order.status}>{orderLabels[order.status] || order.status}</span></span><span>Pengiriman: {fulfillmentLabels[order.fulfillment_status] || order.fulfillment_status}</span></div>
                    </header>
                    <ul className="customer-order-items">{order.items.map((item, index) => <li className="customer-order-item" key={index}>
                        <Photo src={item.image} alt={item.title} />
                        <div><strong>{item.title}</strong>{item.variant && <p>Varian: {item.variant}</p>}<p>{item.quantity} × {money(item.unit_price)}</p></div><strong>{money(item.subtotal)}</strong>
                    </li>)}</ul>
                    <footer className="customer-order-summary"><div>{order.coupon_code && <p>Kupon {order.coupon_code} · diskon {money(order.discount_amount)}</p>}{order.tracking_number ? <p>Resi: {order.carrier} · {order.tracking_number}</p> : <p>Resi belum tersedia.</p>}</div><div><small>Total pesanan</small><strong>{money(order.total_price)}</strong></div></footer>
                    <button className="button secondary" onClick={() => onReceipt(order.id)}>Lihat detail & pembayaran</button>
                    <ShipmentStatus orderId={order.id} />
                </article>)}</div>
                {result.count > 0 && <Pagination page={page} count={result.count} size={CUSTOMER_ORDER_PAGE_SIZE} disabled={busy} onChange={changePage} />}
            </>}
        </>}
    </section>;
}

export function WishlistPage({ session, products, loading, error, onRemove, onProduct }: {
    session: Session | null;
    products: Product[];
    loading: boolean;
    error: string;
    onRemove: (product: Product) => void;
    onProduct: (id: string) => void;
}) {
    if (loading)
        return <section className="container section"><Message loading /></section>;
    if (!session)
        return <section className="container section stack"><h1>Wishlist</h1><p>Masuk ke akun pelanggan untuk menyimpan dan menyinkronkan produk pilihan antarperangkat.</p></section>;
    return <section className="container section">
        <div className="section-heading"><div><p className="eyebrow">Tersimpan di akun</p><h1>Wishlist</h1></div><span className="muted">{products.length} produk</span></div>
        <Message error={error} loading={loading} />
        {!loading && !error && !products.length && <p className="empty">Wishlist masih kosong.</p>}
        <div className="product-grid">
            {products.map(product => <article className="product-card" key={product.id}>
                <button className="product-photo" onClick={() => onProduct(product.id)} aria-label={'Lihat ' + product.title}><Photo src={product.image_url || product.images[0]} alt={product.title} /></button>
                <div className="product-copy"><p className="eyebrow">{product.category || 'Koleksi'}</p><h2><button className="product-name" onClick={() => onProduct(product.id)}>{product.title}</button></h2><strong>{money(product.price)}</strong>
                    {(!product.variants.length && product.stock === 0) || (product.variants.length > 0 && product.variants.every(variant => variant.stock === 0)) ? <small className="stock-unavailable">Stok habis</small> : null}
                    <div className="actions"><button className="button secondary" onClick={() => onProduct(product.id)}>Lihat produk</button><button className="text-button danger" onClick={() => onRemove(product)}>Hapus</button></div>
                </div>
            </article>)}
        </div>
    </section>;
}

export function ArticleIndex({ onOpen }: { onOpen: (slug: string) => void }) {
    const articles = useResource('published-articles', getPublishedArticles, 'store-published-articles', true);
    return <section className="container section">
        <p className="eyebrow">Cerita & panduan</p><h1>Artikel</h1>
        <Message error={articles.error} loading={articles.loading} />
        {!articles.loading && !articles.error && !articles.data?.length && <p className="empty">Belum ada artikel yang diterbitkan.</p>}
        <div className="article-grid">{articles.data?.map(article => <article className="panel article-card" key={article.id}>
            {article.cover_image_url && <Photo src={article.cover_image_url} alt="" className="article-cover" />}
            <small>{article.published_at ? new Date(article.published_at).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long' }) : ''}</small>
            <h2><button className="product-name" onClick={() => onOpen(article.slug)}>{article.title}</button></h2>
            <p>{article.excerpt}</p>
            <button className="text-button" onClick={() => onOpen(article.slug)}>Baca artikel</button>
        </article>)}</div>
    </section>;
}

export function ArticleDetail({ slug, onBack }: { slug: string; onBack: () => void }) {
    const article = useResource('published-article:' + slug, () => getPublishedArticle(slug), 'store-article:' + slug, true);
    useEffect(() => {
        if (article.data)
            document.title = article.data.title;
        return () => { document.title = 'ZYHA ID'; };
    }, [article.data?.title]);
    if (article.loading || article.error)
        return <section className="container section"><Message error={article.error} loading={article.loading} /></section>;
    if (!article.data)
        return <section className="container section stack"><h1>Artikel tidak ditemukan</h1><button className="button secondary" onClick={onBack}>Kembali ke artikel</button></section>;
    const data: Article = article.data;
    return <article className="container section article-detail">
        <button className="text-button" onClick={onBack}>Kembali ke artikel</button>
        {data.cover_image_url && <Photo src={data.cover_image_url} alt="" className="article-detail-cover" />}
        <p className="eyebrow">{data.published_at ? new Date(data.published_at).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long' }) : ''}</p>
        <h1>{data.title}</h1>
        {data.excerpt && <p className="article-excerpt">{data.excerpt}</p>}
        <div className="article-body">{data.body}</div>
    </article>;
}
