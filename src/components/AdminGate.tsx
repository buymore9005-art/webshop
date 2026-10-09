import type { FormEvent } from 'react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { client } from '../../supabaseClient';
import { Field, Message } from './UI';
export default function AdminGate({ children }: {
  children: ReactNode;
}) {
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
        recovery.current = false;
        setState('login');
        setPassword('');
      }
      else if (event === 'SIGNED_IN' && authUser.current !== nextSession?.user.id) {
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
    return <main className="auth-page">
      <p role="status">Memeriksa akses Admin…</p>
    </main>;
  if (state === 'denied')
    return <main className="auth-page">
      <section className="panel auth-panel">
        <h1>Akses Admin diperlukan</h1>
        <p>Akun ini belum mendapat izin, atau koneksi pemeriksaan akses sedang gagal.</p>
        <Message error={error} />
        <button className="button" onClick={() => window.location.reload()}>Periksa kembali</button>
        <button className="button secondary" onClick={() => void client().auth.signOut()}>Keluar</button>
        <Link to="/">Kembali ke toko</Link>
      </section>
    </main>;
  return <main className="auth-page">
    <section className="panel auth-panel">
      <Link to="/" className="brand">ZYHA <span>ID</span>
      </Link>
      <h1>
        {state === 'recovery' ? 'Atur password baru' : 'Masuk Backoffice'}
      </h1>
      <p>Gunakan akun Admin yang telah diaktifkan.</p>
      <form onSubmit={state === 'recovery' ? updatePassword : login} className="stack">
        {state !== 'recovery' && <Field label="Email">
          <input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
        </Field>}
        <Field label="Password">
          <input type="password" required minLength={state === 'recovery' ? 12 : 1} autoComplete={state === 'recovery' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
        <Message error={error} success={message} />
        <button className="button" disabled={busy}>
          {busy ? 'Memproses…' : state === 'recovery' ? 'Simpan password' : 'Masuk'}
        </button>
      </form>
      {state === 'login' && <button className="button secondary" disabled={busy} onClick={reset}>Lupa password</button>}
      <Link to="/">Kembali ke toko</Link>
    </section>
  </main>;
}
