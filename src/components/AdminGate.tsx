import type { FormEvent } from 'react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { client } from '../../supabaseClient';
import { Field, Message } from './UI';
import { clearResourceCache } from '../lib/useResource';
import { useTranslation } from 'react-i18next';
import { localizedMessage } from '../i18n';
import { LanguageSelector } from './LanguageSelector';
export default function AdminGate({ children }: {
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<'loading' | 'login' | 'denied' | 'ready' | 'recovery'>('loading');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const generation = useRef(0), recovery = useRef(false), authUser = useRef<string | null>(null);
  const location = useLocation();
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const check = async () => {
      const n = ++generation.current;
      try {
        const { data, error: sessionError } = await client().auth.getSession();
        if (sessionError)
          throw sessionError;
        if (!active || n !== generation.current)
          return;
        if (!data.session) {
          authUser.current = null;
          setState('login');
          return;
        }
        authUser.current = data.session.user.id;
        if (recovery.current || location.pathname.endsWith('/recovery')) {
          setState('recovery');
          return;
        }
        const { data: allowed, error: roleError } = await client().rpc('zyha_is_admin');
        if (roleError)
          throw roleError;
        if (active && n === generation.current) {
          setState(allowed === true ? 'ready' : 'denied');
          setError('');
        }
      }
      catch (e) {
        if (active && n === generation.current) {
          setState('denied');
          setError(e instanceof Error ? e.message : 'Akses tidak dapat diverifikasi.');
        }
      }
    };
    const { data: { subscription } } = client().auth.onAuthStateChange((event, nextSession) => {
      ++generation.current;
      if (event === 'PASSWORD_RECOVERY')
        recovery.current = true;
      if (event === 'SIGNED_OUT') {
        clearResourceCache();
        recovery.current = false;
        setState('login');
        setPassword('');
      }
      else if (event === 'SIGNED_IN' && authUser.current !== nextSession?.user.id) {
        clearResourceCache();
        setState('loading');
      }
      window.setTimeout(() => {
        if (active)
          void check();
      }, 0);
    });
    void check();
    timer = window.setInterval(() => void check(), 60000);
    const focus = () => void check();
    window.addEventListener('focus', focus);
    return () => { active = false; ++generation.current; subscription.unsubscribe(); clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [location.pathname]);
  async function login(event: FormEvent) {
    event.preventDefault(); if (busy)
      return; setBusy(true); setError(''); try {
        const { error: e } = await client().auth.signInWithPassword({ email: email.trim(), password });
        if (e)
          throw e;
      }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Login gagal.');
    }
    finally {
      setBusy(false);
    }
  }
  async function reset() {
    setError(''); setMessage(''); if (!email.trim()) {
      setError('Isi email terlebih dahulu.');
      return;
    } setBusy(true); try {
      const { error: e } = await client().auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/backoffice/recovery' });
      if (e)
        throw e;
      setMessage('Periksa email untuk petunjuk pemulihan akun.');
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Permintaan gagal.');
    }
    finally {
      setBusy(false);
    }
  }
  async function updatePassword(event: FormEvent) {
    event.preventDefault(); if (password.length < 12) {
      setError('Gunakan password minimal 12 karakter.');
      return;
    } setBusy(true); setError(''); try {
      const { error: e } = await client().auth.updateUser({ password });
      if (e)
        throw e;
      recovery.current = false;
      await client().auth.signOut();
      window.location.replace('/backoffice');
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Password belum tersimpan.');
    }
    finally {
      setBusy(false);
    }
  }
  if (state === 'ready')
    return <>
      {children}
    </>;
  if (state === 'loading')
    return <main className="auth-page"><section className="panel auth-panel"><LanguageSelector /><p role="status">{t('common.loading')}</p></section></main>;
  if (state === 'denied')
    return <main className="auth-page">
      <section className="panel auth-panel">
        <LanguageSelector />
        <h1>{t('auth.denied')}</h1>
        <p>{t('auth.deniedHelp')}</p>
        <Message error={localizedMessage(error)} />
        <button className="button" onClick={() => window.location.reload()}>{t('common.retry')}</button>
        <button className="button secondary" onClick={() => void client().auth.signOut()}>{t('common.logout')}</button>
        <Link to="/">{t('common.back')}</Link>
      </section>
    </main>;
  return <main className="auth-page">
    <section className="panel auth-panel">
      <LanguageSelector />
      <Link to="/" className="brand">ZYHA <span>ID</span>
      </Link>
      <h1>
        {t(state === 'recovery' ? 'auth.resetTitle' : 'auth.title')}
      </h1>
      <p>{t('auth.help')}</p>
      <form onSubmit={state === 'recovery' ? updatePassword : login} className="stack">
        {state !== 'recovery' && <Field label={t('common.email')}>
          <input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
        </Field>}
        <Field label={t('common.password')}>
          <input type="password" required minLength={state === 'recovery' ? 12 : 1} autoComplete={state === 'recovery' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
        <Message error={localizedMessage(error)} success={localizedMessage(message)} />
        <button className="button" disabled={busy}>
          {t(busy ? 'auth.busy' : state === 'recovery' ? 'auth.savePassword' : 'auth.login')}
        </button>
      </form>
      {state === 'login' && <button className="button secondary" disabled={busy} onClick={reset}>{t('auth.forgot')}</button>}
      <Link to="/">{t('common.back')}</Link>
    </section>
  </main>;
}
