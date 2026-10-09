import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { client, projectStorageKey } from './supabaseClient';
import type { CartLine, Customer, OrderAccess, Product, Receipt } from './src/types';
import { addCartLine, errorMessage, money, parseCart, setCartQuantity, whatsappUrl } from './src/lib/domain';
import { getMethods, getProduct, getProducts, getSettings, loadReceipt, readOrderAccess } from './src/lib/api';
import { useResource } from './src/lib/useResource';
import { Field, Message, Pagination, Photo } from './src/components/UI';
import { CartPanel } from './src/shop/CartPanel';
import { Checkout } from './src/shop/Checkout';
import { OrderReceipt } from './src/shop/OrderReceipt';
import { openLiveChat } from './src/shop/payment';
// Existing storefront: catalog -> detail/cart -> checkout. No production-app code.
export default function App() {
  const [params, setParams] = useSearchParams();
  const [showCart, setShowCart] = useState(false);
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      return parseCart(localStorage.getItem(projectStorageKey + 'cart'));
    }
    catch {
      return [];
    }
  });
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null), [access, setAccess] = useState<OrderAccess | null>(readOrderAccess), [customer, setCustomer] = useState<Customer | undefined>();
  const [revision, setRevision] = useState(0);
  const search = params.get('q') || '', category = params.get('category') || '', sort = params.get('sort') || 'newest';
  const page = Math.max(0, Math.min(100000, Math.floor(Number(params.get('page'))) || 0));
  const view = params.get('view') || 'shop', detailId = params.get('product') || '';
  const settings = useResource('settings:' + revision, () => getSettings());
  const methods = useResource('methods:' + revision, () => getMethods());
  const catalog = useResource(JSON.stringify([search, category, sort, page, revision]), signal => getProducts({ search, category, sort, page }, signal));
  const detail = useResource('product:' + detailId + ':' + revision, () => detailId ? getProduct(detailId) : Promise.resolve(null));
  useEffect(() => {
    try {
      localStorage.setItem(projectStorageKey + 'cart', JSON.stringify(cart));
    }
    catch {
      setNotice('Keranjang belum dapat disimpan pada perangkat ini. Jangan tutup halaman sebelum selesai.');
    }
  }, [cart]);
  useEffect(() => { const channel = client().channel('zyha-store').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => setRevision(n => n + 1)).on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => setRevision(n => n + 1)).on('postgres_changes', { event: '*', schema: 'public', table: 'payment_methods' }, () => setRevision(n => n + 1)).subscribe(); return () => { void client().removeChannel(channel); }; }, []);
  useEffect(() => {
    if (settings.data)
      document.title = settings.data.store_name;
  }, [settings.data?.store_name]);
  useEffect(() => {
    if (view !== 'receipt' || !access || receipt)
      return; let active = true; void loadReceipt(access).then(r => {
        if (active)
          setReceipt(r);
      }).catch(e => {
        if (active)
          setError(errorMessage(e));
      }); return () => { active = false; };
  }, [view, access?.requestId]);
  function navigate(nextView = 'shop', productId = '') {
    const next = new URLSearchParams(params); next.delete('product'); next.delete('view'); if (nextView !== 'shop')
      next.set('view', nextView); if (productId)
      next.set('product', productId); setParams(next); setError(''); window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params); next.delete('page'); if (value)
      next.set(key, value);
    else
      next.delete(key); setParams(next, { replace: true });
  }
  function add(product: Product, variant = '', buyNow = false) {
    try {
      const next = addCartLine(cart, product, variant);
      setCart(next);
      setError('');
      if (buyNow) {
        setShowCart(false);
        navigate('checkout');
      }
      else
        setShowCart(true);
    }
    catch (e) {
      setError(errorMessage(e));
    }
  }
  function done(order: Receipt, ref: OrderAccess, data: Customer) { setReceipt(order); setAccess(ref); setCustomer(data); setCart([]); navigate('receipt'); }
  const store = settings.data;
  let wa = '';
  try {
    if (store?.admin_phone)
      wa = whatsappUrl(store.admin_phone, 'Halo, saya ingin bertanya tentang produk ZYHA ID.');
  }
  catch { }
  return <div className="storefront">
    <header className="store-header">
      <div className="container header-inner">
        <button className="brand" onClick={() => navigate()}>
          {store?.store_name || 'ZYHA ID'}
        </button>
        <nav aria-label="Navigasi toko">
          <button className="text-button store-nav-link" aria-current={view === 'shop' && !detailId ? 'page' : undefined} onClick={() => navigate()}>Katalog</button>
          {access && <button className="text-button store-nav-link" aria-current={view === 'receipt' ? 'page' : undefined} onClick={() => navigate('receipt')}>Pesanan terakhir</button>}
          <button className="button store-cart-button" onClick={() => setShowCart(true)}>
            <StoreIcon name="bag" />
            <span>Keranjang</span>
            <span className="cart-count">{cart.reduce((s, x) => s + x.quantity, 0)}</span>
          </button>
        </nav>
      </div>
    </header>
    <main>
      <div className="container">
        <Message error={error || settings.error || methods.error} success={notice} />
        {(settings.error || methods.error) && <button className="button secondary" onClick={() => { settings.reload(); methods.reload(); }}>Coba kembali</button>}
      </div>
      {view === 'checkout' && store ? <Checkout cart={cart} settings={store} methods={(methods.data || []).filter(m => m.type !== 'Midtrans' || store.midtrans_enabled)} onDone={done} onBack={() => navigate()} /> : view === 'receipt' && store ? <>
        {receipt && access ? <OrderReceipt key={receipt.id} initial={receipt} access={access} settings={store} customer={customer} onBack={() => navigate()} /> : <section className="container section">
          <Message loading={!error && !!access} />
          {!access && <p>Belum ada bukti pesanan pada tab ini.</p>}
          <button className="button secondary" onClick={() => navigate()}>Kembali ke katalog</button>
        </section>}
      </> : detailId ? <section className="container section product-section">
        <button className="text-button back-link" onClick={() => navigate()}><StoreIcon name="arrow-left" />Kembali ke katalog</button>
        <Message error={detail.error} loading={detail.loading} />
        {detail.data ? <ProductDetail key={detail.data.id} product={detail.data} onAdd={add} /> : !detail.loading && <p className="empty">Produk tidak ditemukan atau sudah tidak aktif.</p>}
      </section> : <>
        <section className="container hero-section" aria-label="Koleksi pilihan">
          <div className={'hero ' + (store?.banner_url ? 'with-image' : '')}>
            {store?.banner_url && <div className="hero-media" key={store?.banner_url || 'no-banner'}>
              <Photo src={store.banner_url} alt={'Koleksi ' + store.store_name} />
            </div>}
            <div className="hero-copy">
              <p className="eyebrow">Koleksi pilihan</p>
              <h1>{store?.hero_title || 'GET READY BAGS.'}</h1>
              <p className="hero-description">{store?.store_notice || 'Temukan tas yang sesuai dengan keseharian Anda.'}</p>
              <a href="#catalog" className="button">Belanja koleksi<StoreIcon name="arrow-right" /></a>
            </div>
          </div>
        </section>
        <section className="container section catalog-section" id="catalog">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{store?.store_name || 'ZYHA ID'}</p>
              <h2>Katalog produk</h2>
            </div>
            <span className="catalog-count muted">{catalog.loading ? 'Memuat koleksi…' : (catalog.data?.count ?? 0) + ' produk'}</span>
          </div>
          <div className="catalog-filters">
            <div className="search-field">
              <Field label="Cari produk">
                <input type="search" placeholder="Nama produk…" value={search} onChange={e => filter('q', e.target.value)} maxLength={100} />
              </Field>
              <StoreIcon name="search" />
            </div>
            <Field label="Kategori">
              <select value={category} onChange={e => filter('category', e.target.value)}>
                <option value="">Semua kategori</option>
                {(store?.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Urutkan">
              <select value={sort} onChange={e => filter('sort', e.target.value)}>
                <option value="newest">Terbaru</option>
                <option value="price_asc">Harga terendah</option>
                <option value="price_desc">Harga tertinggi</option>
              </select>
            </Field>
          </div>
          <Message error={catalog.error} loading={catalog.loading} />
          {catalog.error && <button className="button secondary" onClick={catalog.reload}>Muat ulang katalog</button>}
          {!catalog.loading && !catalog.error && !catalog.data?.rows.length && <div className="empty">
            <h3>Belum ada produk untuk pilihan ini</h3>
            <p>Ubah pencarian atau kategori untuk melihat pilihan lainnya.</p>
          </div>}
          <div className="product-grid" key={JSON.stringify([search, category, sort, page])} aria-busy={catalog.loading}>
            {catalog.data?.rows.map((p, index) => <article className="product-card" key={p.id} style={{ animationDelay: Math.min(index, 7) * 45 + 'ms' }}>
              <button className="product-photo" onClick={() => navigate('shop', p.id)} aria-label={'Lihat ' + p.title}>
                <Photo src={p.image_url || p.images[0]} alt={p.title} />
              </button>
              <div className="product-copy">
                <p className="eyebrow">{p.category || 'Koleksi'}</p>
                <h3><button className="product-name" onClick={() => navigate('shop', p.id)}>{p.title}</button></h3>
                <strong>{money(p.price)}</strong>
                {p.stock === 0 && <small className="stock-unavailable">Stok habis</small>}
                <button type="button" className="button secondary wide product-action" disabled={p.stock === 0} onClick={() => p.variants.length ? navigate('shop', p.id) : add(p)}>
                  {p.variants.length ? 'Pilih varian' : 'Tambah ke keranjang'}
                </button>
              </div>
            </article>)}
          </div>
          {(catalog.data?.count || 0) > 16 && <Pagination page={page} count={catalog.data?.count || 0} size={16} disabled={catalog.loading} onChange={n => { const next = new URLSearchParams(params); next.set('page', String(n)); setParams(next); document.getElementById('catalog')?.scrollIntoView(); }} />}
        </section>
      </>}
    </main>
    <footer className="store-footer">
      <div className="container footer-inner">
        <div>
          <strong className="footer-brand">{store?.store_name || 'ZYHA ID'}</strong>
          <p>Katalog dan pemesanan online.</p>
        </div>
        <div className="actions">
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer">Hubungi WhatsApp</a>}
          {import.meta.env.VITE_TAWK_PROPERTY_ID && <button className="text-button" onClick={() => void openLiveChat().catch(e => setError(errorMessage(e)))}>Chat langsung</button>}
        </div>
      </div>
    </footer>
    <CartPanel open={showCart} cart={cart} onClose={() => setShowCart(false)} onQuantity={(line, n) => {
      try {
        setCart(setCartQuantity(cart, line.product_id, line.variant, n));
      }
      catch (e) {
        setError(errorMessage(e));
      }
    }} onRemove={line => setCart(cart.filter(x => x.product_id !== line.product_id || x.variant !== line.variant))} onCheckout={() => { setShowCart(false); navigate('checkout'); }} />
  </div>;
}
function ProductDetail({ product: p, onAdd }: {
  product: Product;
  onAdd: (product: Product, variant: string, buyNow?: boolean) => void;
}) {
  const [variant, setVariant] = useState(p.variants[0]?.name || '');
  const [image, setImage] = useState(p.images[0] || p.image_url);
  // Display gallery uses only product photos; variant previews live in their own selection panel.
  const images = Array.from(new Set([p.image_url, ...p.images].filter(Boolean)));
  const imageVariant = p.variants.find(v => v.image && v.image === image);
  return <div className="product-detail">
    <section className="product-gallery" aria-label="Display produk">
      <div className="gallery-heading">
        <p className="eyebrow">Galeri produk</p>
        <span className="muted">{images.length} foto display</span>
      </div>
      <figure className="product-stage">
        <div className="image-transition" key={image}>
          <Photo src={image} alt={p.title} className="detail-photo" />
        </div>
        <figcaption className="image-caption">
          {imageVariant && !images.includes(image) ? 'Foto varian: ' + imageVariant.name : 'Foto produk'}
        </figcaption>
      </figure>
      <div className="gallery" aria-label="Foto display produk">
        {images.map((img, i) => <button type="button" key={img} className={image === img ? 'selected' : ''} onClick={() => setImage(img)} aria-label={'Foto ' + (i + 1)} aria-pressed={image === img}>
          <Photo src={img} alt={p.title + ' ' + (i + 1)} />
        </button>)}
      </div>
    </section>
    <section className="stack product-info" aria-label="Informasi dan pilihan produk">
      <div className="product-heading">
        <p className="eyebrow">{p.category}</p>
        <h1>{p.title}</h1>
        <p className="price">{money(p.price)}</p>
      </div>
      <div className="product-description-block">
        <h2>Detail produk</h2>
        <p className="product-description">{p.description || 'Deskripsi belum tersedia.'}</p>
      </div>
      {p.stock !== null && <p className={'stock-status ' + (p.stock === 0 ? 'out-of-stock' : '')}>
        {p.stock > 0 ? 'Stok tersedia: ' + p.stock : 'Stok habis'}
      </p>}
      {p.variants.length > 0 && <fieldset className="variant-panel">
        <legend>Pilih varian</legend>
        <p className="variant-hint">Pilihan ini akan dicantumkan pada pesanan Anda.</p>
        <div className="variants">
          {p.variants.map(v => <button type="button" key={v.name} className={'button secondary variant-option ' + (variant === v.name ? 'selected' : '')} aria-pressed={variant === v.name} onClick={() => {
            setVariant(v.name); if (v.image)
              setImage(v.image);
          }}>
            {v.image && <span className="variant-thumbnail"><Photo src={v.image} alt={'Varian ' + v.name} /></span>}
            <span className="variant-label">{v.name}</span>
          </button>)}
        </div>
        <p className="selection-summary" role="status">Varian terpilih: <strong>{variant}</strong></p>
      </fieldset>}
      <div className="actions product-purchase">
        <button className="button secondary" disabled={p.stock === 0} onClick={() => onAdd(p, variant)}>Tambah ke keranjang</button>
        <button className="button" disabled={p.stock === 0} onClick={() => onAdd(p, variant, true)}>Beli langsung<StoreIcon name="arrow-right" /></button>
      </div>
    </section>
  </div>;
}

/** Small functional outline glyphs. Labels remain visible; no icon package or remote assets. */
function StoreIcon({ name }: { name: 'bag' | 'search' | 'arrow-left' | 'arrow-right' }) {
  return <svg className="store-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {name === 'bag' ? <><path d="M5 7h14l1 14H4L5 7Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></> : name === 'search' ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></> : name === 'arrow-left' ? <path d="M20 12H4m7-7-7 7 7 7" /> : <path d="M4 12h16m-7-7 7 7-7 7" />}
  </svg>;
}
