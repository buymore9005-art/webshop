import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { client } from './supabaseClient';
import AdminGate from './src/components/AdminGate';
import Dashboard from './src/admin/Dashboard';
import Products from './src/admin/Products';
import Payments from './src/admin/Payments';
import Orders from './src/admin/Orders';
import Settings from './src/admin/Settings';
import Content from './src/admin/Content';
import Coupons from './src/admin/Coupons';
import { Modal } from './src/components/UI';
const navigation = [['dashboard', 'Dashboard'], ['products', 'Produk & katalog'], ['coupons', 'Kupon'], ['banks', 'Metode bayar'], ['orders', 'Pesanan'], ['analytics', 'Analitik'], ['content', 'Artikel & footer'], ['wa', 'WhatsApp'], ['settings', 'Pengaturan']];
export default function Admin() {
  return <AdminGate>
    <AdminWorkspace />
  </AdminGate>;
}
function AdminWorkspace() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('view') || 'dashboard';
  const view = navigation.some(([key]) => key === requested) ? requested : 'dashboard';
  const [mobileMenu, setMobileMenu] = useState(false);
  const nav = <nav className="admin-nav" aria-label="Navigasi backoffice">
    {navigation.map(([key, label]) => <button type="button" key={key} aria-current={view === key ? 'page' : undefined} className={view === key ? 'active' : ''} onClick={() => { setParams({ view: key }); setMobileMenu(false); }}>
      {label}
    </button>)}
  </nav>;
  return <div className="admin-layout">
    <aside className="admin-sidebar">
      <Link className="brand" to="/">ZYHA <span>ID</span>
      </Link>
      <p className="sidebar-caption">Backoffice</p>
      {nav}
      <Link className="sidebar-store" to="/">Lihat toko</Link>
      <button className="button secondary" onClick={() => void client().auth.signOut()}>Keluar</button>
    </aside>
    <div className="admin-content">
      <header className="admin-mobile-header">
        <Link className="brand" to="/">ZYHA ID</Link>
        <button type="button" className="button secondary" onClick={() => setMobileMenu(true)}>Menu</button>
      </header>
      <main className="admin-main">
        {view === 'dashboard' && <Dashboard />}
        {view === 'products' && <Products />}
        {view === 'coupons' && <Coupons />}
        {view === 'banks' && <Payments />}
        {view === 'orders' && <Orders />}
        {view === 'analytics' && <Dashboard analytics />}
        {view === 'content' && <Content />}
        {view === 'wa' && <Settings whatsappOnly />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
    <Modal open={mobileMenu} title="Menu backoffice" onClose={() => setMobileMenu(false)}>
      {nav}
      <div className="stack">
        <Link className="button secondary" to="/">Lihat toko</Link>
        <button className="button secondary" onClick={() => void client().auth.signOut()}>Keluar</button>
      </div>
    </Modal>
  </div>;
}
