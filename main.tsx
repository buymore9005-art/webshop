import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import App from './App';
import { configurationError } from './supabaseClient';
import { ErrorBoundary } from './src/components/UI';
import './index.css';
import { I18nextProvider, useTranslation } from 'react-i18next';
import i18n, { localizedMessage } from './src/i18n';
import { LanguageSelector } from './src/components/LanguageSelector';
const Admin = lazy(() => import('./Admin'));
const root = document.getElementById('root');
if (!root)
  throw new Error('Root element tidak ditemukan.');
function Application() {
  const { t } = useTranslation();
  return <ErrorBoundary>
    {configurationError ? <main className="auth-page">
      <section className="panel auth-panel">
        <LanguageSelector />
        <h1>{t('shell.configuration')}</h1>
        <p role="alert">
          {localizedMessage(configurationError)}
        </p>
        <p>{t('shell.setup')}</p>
      </section>
    </main> : <BrowserRouter>
      <Suspense fallback={<p className="container section" role="status">{t('common.loading')}</p>}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/backoffice/*" element={<Admin />} />
          <Route path="*" element={<main className="container section">
            <LanguageSelector />
            <h1>{t('shell.notFound')}</h1>
            <Link className="button" to="/">{t('common.back')}</Link>
          </main>} />
        </Routes>
      </Suspense>
    </BrowserRouter>}
  </ErrorBoundary>;
}
ReactDOM.createRoot(root).render(<React.StrictMode>
  <I18nextProvider i18n={i18n}><Application /></I18nextProvider>
</React.StrictMode>);
