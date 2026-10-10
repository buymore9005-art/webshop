import type { FormEvent } from 'react';
import { useState } from 'react';
import type { Coupon } from '../types';
import { getAdminCoupons, saveCoupon } from '../lib/api';
import { errorMessage, money } from '../lib/domain';
import { useResource } from '../lib/useResource';
import { Field, Message, Modal } from '../components/UI';

type Draft = {
    code: string;
    discount_type: Coupon['discount_type'];
    discount_value: number;
    min_subtotal: number;
    starts_at: string;
    ends_at: string;
    max_uses: string;
    max_uses_per_customer: string;
    is_active: boolean;
};
const localDateTime = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const blank = (): Draft => ({ code: '', discount_type: 'percent', discount_value: 10, min_subtotal: 0, starts_at: localDateTime(new Date()), ends_at: '', max_uses: '', max_uses_per_customer: '', is_active: true });

export default function Coupons() {
    const [revision, setRevision] = useState(0);
    const coupons = useResource('admin-coupons:' + revision, getAdminCoupons);
    const [open, setOpen] = useState(false), [editing, setEditing] = useState<Coupon | undefined>();
    const [draft, setDraft] = useState<Draft>(blank), [busy, setBusy] = useState(false);
    const [error, setError] = useState(''), [message, setMessage] = useState('');
    function edit(coupon?: Coupon) {
        setEditing(coupon);
        setDraft(coupon ? {
            code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value,
            min_subtotal: coupon.min_subtotal, starts_at: localDateTime(new Date(coupon.starts_at)),
            ends_at: coupon.ends_at ? localDateTime(new Date(coupon.ends_at)) : '',
            max_uses: coupon.max_uses === null ? '' : String(coupon.max_uses),
            max_uses_per_customer: coupon.max_uses_per_customer === null ? '' : String(coupon.max_uses_per_customer),
            is_active: coupon.is_active,
        } : blank());
        setError('');
        setOpen(true);
    }
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError('');
        try {
            await saveCoupon({
                code: draft.code,
                discount_type: draft.discount_type,
                discount_value: Number(draft.discount_value),
                min_subtotal: Number(draft.min_subtotal),
                starts_at: new Date(draft.starts_at).toISOString(),
                ends_at: draft.ends_at ? new Date(draft.ends_at).toISOString() : null,
                max_uses: draft.max_uses ? Number(draft.max_uses) : null,
                max_uses_per_customer: draft.max_uses_per_customer ? Number(draft.max_uses_per_customer) : null,
                is_active: draft.is_active,
            }, editing?.id);
            setOpen(false);
            setRevision(value => value + 1);
            setMessage('Kupon berhasil disimpan.');
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function toggle(coupon: Coupon) {
        if (busy)
            return;
        const next = !coupon.is_active;
        if (!window.confirm(`${next ? 'Aktifkan' : 'Nonaktifkan'} kupon ${coupon.code}?`))
            return;
        setBusy(true);
        setError('');
        try {
            await saveCoupon({
                code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value,
                min_subtotal: coupon.min_subtotal, starts_at: coupon.starts_at, ends_at: coupon.ends_at,
                max_uses: coupon.max_uses, max_uses_per_customer: coupon.max_uses_per_customer, is_active: next,
            }, coupon.id);
            setRevision(value => value + 1);
            setMessage(`Kupon ${coupon.code} ${next ? 'diaktifkan' : 'dinonaktifkan'}.`);
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="stack">
        <div className="section-heading"><div><h1>Kupon diskon</h1><p className="muted">Satu kode per pesanan; validasi batas dan penerapan diskon dilakukan atomik oleh database saat checkout.</p></div>
            <button className="button" onClick={() => edit()}>Tambah kupon</button>
        </div>
        <Message error={error || coupons.error} success={message} loading={coupons.loading} />
        <div className="coupon-list">
            {coupons.data?.map(coupon => <article className="panel stack" key={coupon.id}>
                <div className="split"><div><h2>{coupon.code}</h2><small>{coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : money(coupon.discount_value)} · minimum {money(coupon.min_subtotal)}</small></div>
                    <span className={'status ' + (coupon.is_active ? 'paid' : 'cancelled')}>{coupon.is_active ? 'Aktif' : 'Nonaktif'}</span></div>
                <p>Terpakai {coupon.times_used}{coupon.max_uses === null ? '' : ` dari ${coupon.max_uses}`} · limit pelanggan {coupon.max_uses_per_customer ?? 'tanpa batas'}</p>
                <small>Berlaku {new Date(coupon.starts_at).toLocaleString('id-ID')}{coupon.ends_at ? ` – ${new Date(coupon.ends_at).toLocaleString('id-ID')}` : ' – tanpa tanggal akhir'}</small>
                <div className="actions"><button className="button secondary" disabled={busy} onClick={() => edit(coupon)}>Ubah</button><button className="text-button" disabled={busy} onClick={() => void toggle(coupon)}>{coupon.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></div>
            </article>)}
            {!coupons.loading && !coupons.error && !coupons.data?.length && <p className="empty">Belum ada kupon. Kupon aktif tersedia di checkout setelah disimpan.</p>}
        </div>
        <Modal open={open} title={editing ? 'Ubah kupon' : 'Tambah kupon'} onClose={() => setOpen(false)} busy={busy}>
            <form className="stack" onSubmit={submit}>
                <Field label="Kode kupon" hint="3–40 huruf, angka, garis bawah, atau tanda hubung. Kode disimpan huruf besar.">
                    <input required minLength={3} maxLength={40} pattern="[A-Za-z0-9_-]+" value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })} />
                </Field>
                <div className="form-grid">
                    <Field label="Jenis diskon"><select value={draft.discount_type} onChange={e => setDraft({ ...draft, discount_type: e.target.value as Coupon['discount_type'], discount_value: e.target.value === 'percent' ? 10 : 10000 })}><option value="percent">Persentase</option><option value="fixed">Nominal tetap (Rp)</option></select></Field>
                    <Field label={draft.discount_type === 'percent' ? 'Diskon (%)' : 'Diskon (Rp)'}><input required type="number" min={1} max={draft.discount_type === 'percent' ? 99 : 1000000000} step={1} value={draft.discount_value} onChange={e => setDraft({ ...draft, discount_value: Number(e.target.value) })} /></Field>
                    <Field label="Minimum belanja (Rp)"><input required type="number" min={0} max={1000000000} step={1} value={draft.min_subtotal} onChange={e => setDraft({ ...draft, min_subtotal: Number(e.target.value) })} /></Field>
                    <Field label="Batas total penggunaan" hint="Kosong = tanpa batas."><input type="number" min={1} max={1000000} step={1} value={draft.max_uses} onChange={e => setDraft({ ...draft, max_uses: e.target.value })} /></Field>
                    <Field label="Batas per pelanggan" hint="Pelanggan dikenali melalui hash nomor WhatsApp checkout."><input type="number" min={1} max={1000000} step={1} value={draft.max_uses_per_customer} onChange={e => setDraft({ ...draft, max_uses_per_customer: e.target.value })} /></Field>
                    <Field label="Mulai berlaku"><input required type="datetime-local" value={draft.starts_at} onChange={e => setDraft({ ...draft, starts_at: e.target.value })} /></Field>
                    <Field label="Berakhir (opsional)"><input type="datetime-local" value={draft.ends_at} onChange={e => setDraft({ ...draft, ends_at: e.target.value })} /></Field>
                </div>
                <label className="check"><input type="checkbox" checked={draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} />Kupon aktif</label>
                <Message error={error} />
                <button className="button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan kupon'}</button>
            </form>
        </Modal>
    </section>;
}
