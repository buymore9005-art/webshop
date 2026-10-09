import React, { useEffect, useId, useRef, useState } from 'react';
import { safeImageUrl } from '../lib/domain';
export function Message({ error = '', success = '', loading = false }: {
  error?: string;
  success?: string;
  loading?: boolean;
}) {
  return <>
    {loading && <p className="message" role="status">Memuat data…</p>}
    {error && <p className="message error" role="alert">
      {error}
    </p>}
    {success && <p className="message success" role="status">
      {success}
    </p>}
  </>;
}
export function Field({ label, children, hint }: {
  label: string;
  children: React.ReactElement<{
    id?: string;
  }>;
  hint?: string;
}) {
  const id = useId();
  const fieldId = children.props.id || id;
  return <div className="field">
    <label htmlFor={fieldId}>
      {label}
    </label>
    {React.cloneElement(children, { id: fieldId })}
    {hint && <small>
      {hint}
    </small>}
  </div>;
}
export function Photo({ src, alt, className = '' }: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const url = safeImageUrl(src);
  return url && !failed ? <img src={url} alt={alt} className={'photo ' + className} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <div className={'photo photo-empty ' + className}>Foto belum tersedia</div>;
}
export function Pagination({ page, count, size, onChange, disabled = false }: {
  page: number;
  count: number;
  size: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  return <div className="pagination">
    <button type="button" className="button secondary" disabled={disabled || page === 0} onClick={() => onChange(page - 1)}>Sebelumnya</button>
    <span>Halaman {page + 1} / {Math.max(1, Math.ceil(count / size))}
    </span>
    <button type="button" className="button secondary" disabled={disabled || (page + 1) * size >= count} onClick={() => onChange(page + 1)}>Berikutnya</button>
  </div>;
}
export function Modal({ open, title, onClose, children, busy = false }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current; if (!open || !dialog)
      return; const previous = document.activeElement as HTMLElement | null; dialog.showModal(); const old = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { dialog.close(); document.body.style.overflow = old; previous?.focus(); };
  }, [open]);
  if (!open)
    return null;
  return <dialog className="modal" ref={ref} aria-labelledby={titleId} onCancel={e => {
    e.preventDefault(); if (!busy)
      onClose();
  }}>
    <header>
      <h2 id={titleId}>
        {title}
      </h2>
      <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Tutup</button>
    </header>
    <div className="modal-content">
      {children}
    </div>
  </dialog>;
}
export class ErrorBoundary extends React.Component<{
  children: React.ReactNode;
}, {
  failed: boolean;
}> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="container section">
      <h1>Halaman belum dapat ditampilkan</h1>
      <p>Data yang belum dikirim tidak dianggap tersimpan.</p>
      <button className="button" onClick={() => window.location.reload()}>Muat ulang</button>
    </div> : this.props.children;
  }
}
