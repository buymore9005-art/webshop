import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { client } from './supabaseClient';
import AdminGate from './src/components/AdminGate';
import Dashboard from './src/admin/Dashboard';
import Products from './src/admin/Products';
import Payments from './src/admin/Payments';
import Orders from './src/admin/Orders';
import Settings from './src/admin/Settings';
import LabelTemplates from './src/admin/LabelTemplates';
import Content from './src/admin/Content';
import Coupons from './src/admin/Coupons';
import { Modal } from './src/components/UI';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './src/components/LanguageSelector';
const navigationGroups = [
  { label: 'admin.operations', items: [['dashboard', 'admin.dashboard'], ['orders', 'admin.orders'], ['products', 'admin.products']] },
  { label: 'admin.growth', items: [['coupons', 'admin.coupons'], ['analytics', 'admin.analytics'], ['content', 'admin.content']] },
  { label: 'admin.configuration', items: [['banks', 'admin.banks'], ['wa', 'admin.wa'], ['settings', 'admin.settings'], ['labels', 'admin.labels']] },
];
const navigation = navigationGroups.flatMap(group => group.items);
export default function Admin() {
  return <AdminGate>
    <AdminWorkspace />
  </AdminGate>;
}
function AdminWorkspace() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const requested = params.get('view') || 'dashboard';
  const view = navigation.some(([key]) => key === requested) ? requested : 'dashboard';
  const [mobileMenu, setMobileMenu] = useState(false);
  const nav = <nav className="admin-nav" aria-label={t('admin.navigation')}>
    {navigationGroups.map(group => <div className="admin-nav-group" key={group.label}>
      <p className="admin-nav-caption">{t(group.label)}</p>
      {group.items.map(([key, label]) => <button type="button" key={key} aria-current={view === key ? 'page' : undefined} className={view === key ? 'active' : ''} onClick={() => { setParams({ view: key }); setMobileMenu(false); }}>
      {t(label)}
    </button>)}
    </div>)}
  </nav>;
  return <div className="admin-layout">
    <aside className="admin-sidebar">
      <Link className="brand" to="/">ZYHA <span>ID</span>
      </Link>
      <p className="sidebar-caption">{t('admin.title')}</p>
      <LanguageSelector />
      {nav}
      <Link className="sidebar-store" to="/">{t('common.store')}</Link>
      <button className="button secondary" onClick={() => void client().auth.signOut()}>{t('common.logout')}</button>
    </aside>
    <div className="admin-content">
      <header className="admin-mobile-header">
        <div><Link className="brand" to="/">ZYHA ID</Link><small>{t(navigation.find(([key]) => key === view)?.[1] || 'admin.dashboard')}</small></div>
        <LanguageSelector />
        <button type="button" className="button secondary" aria-haspopup="dialog" aria-expanded={mobileMenu} onClick={() => setMobileMenu(true)}>{t('admin.menu')}</button>
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
        {view === 'labels' && <LabelTemplates />}
      </main>
    </div>
    <Modal open={mobileMenu} title={t('admin.mobileNavigation')} onClose={() => setMobileMenu(false)}>
      {nav}
      <div className="stack">
        <Link className="button secondary" to="/">{t('common.store')}</Link>
        <button className="button secondary" onClick={() => void client().auth.signOut()}>{t('common.logout')}</button>
      </div>
    </Modal>
  </div>;
}
