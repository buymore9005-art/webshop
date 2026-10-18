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
const navigationGroups = [
  { label: 'Operasional', items: [['dashboard', 'Ringkasan'], ['orders', 'Pesanan'], ['products', 'Produk & katalog']] },
  { label: 'Pengembangan toko', items: [['coupons', 'Kupon'], ['analytics', 'Analitik'], ['content', 'Artikel & footer']] },
  { label: 'Konfigurasi', items: [['banks', 'Metode bayar'], ['wa', 'WhatsApp'], ['settings', 'Pengaturan']] },
];
const navigation = navigationGroups.flatMap(group => group.items);
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
    {navigationGroups.map(group => <div className="admin-nav-group" key={group.label}>
      <p className="admin-nav-caption">{group.label}</p>
      {group.items.map(([key, label]) => <button type="button" key={key} aria-current={view === key ? 'page' : undefined} className={view === key ? 'active' : ''} onClick={() => { setParams({ view: key }); setMobileMenu(false); }}>
      {label}
    </button>)}
    </div>)}
  </nav>;
  return <div className="admin-layout">
    <aside className="admin-sidebar">
      <Link className="brand" to="/">ZYHA <span>ID</span>
      </Link>
      <p className="sidebar-caption">Administrasi toko</p>
      {nav}
      <Link className="sidebar-store" to="/">Lihat toko</Link>
      <button className="button secondary" onClick={() => void client().auth.signOut()}>Keluar</button>
    </aside>
    <div className="admin-content">
      <header className="admin-mobile-header">
        <div><Link className="brand" to="/">ZYHA ID</Link><small>{navigation.find(([key]) => key === view)?.[1]}</small></div>
        <button type="button" className="button secondary" aria-haspopup="dialog" aria-expanded={mobileMenu} onClick={() => setMobileMenu(true)}>Menu admin</button>
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
    <Modal open={mobileMenu} title="Navigasi admin" onClose={() => setMobileMenu(false)}>
      {nav}
      <div className="stack">
        <Link className="button secondary" to="/">Lihat toko</Link>
        <button className="button secondary" onClick={() => void client().auth.signOut()}>Keluar</button>
      </div>
    </Modal>
  </div>;
}
