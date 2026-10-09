import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import App from './App';
import { configurationError } from './supabaseClient';
import { ErrorBoundary } from './src/components/UI';
import './index.css';
const Admin = lazy(() => import('./Admin'));
const root = document.getElementById('root');
if (!root)
  throw new Error('Root element tidak ditemukan.');
ReactDOM.createRoot(root).render(<React.StrictMode>
  <ErrorBoundary>
    {configurationError ? <main className="auth-page">
      <section className="panel auth-panel">
        <h1>Konfigurasi toko diperlukan</h1>
        <p role="alert">
          {configurationError}
        </p>
        <p>Atur environment project baru, lalu build/deploy ulang. Lihat README_DEPLOYMENT.md.</p>
      </section>
    </main> : <BrowserRouter>
      <Suspense fallback={<p className="container section" role="status">Memuat halaman…</p>}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/backoffice/*" element={<Admin />} />
          <Route path="*" element={<main className="container section">
            <h1>Halaman tidak ditemukan</h1>
            <Link className="button" to="/">Kembali ke toko</Link>
          </main>} />
        </Routes>
      </Suspense>
    </BrowserRouter>}
  </ErrorBoundary>
</React.StrictMode>);
