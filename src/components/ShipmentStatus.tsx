import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { client } from '../../supabaseClient';
import i18n from '../i18n';
import { shopAction } from '../lib/api';
import { errorMessage } from '../lib/domain';

const en = { title: 'Courier status', sync: 'Sync Biteship', waiting: 'Waiting for courier updates', failed: 'Unable to refresh courier status', refreshed: 'Sync requested; updates may take a minute', updated: 'Last checked', waybill: 'Waybill', confirmed: 'Confirmed', allocated: 'Courier allocated', pickingUp: 'Picking up', picked: 'Picked up', droppingOff: 'Out for delivery', delivered: 'Delivered', returnInTransit: 'Return in transit', returned: 'Returned', cancelled: 'Cancelled', rejected: 'Rejected', disposed: 'Disposed', onHold: 'On hold', courierNotFound: 'Courier not found' };
const id: typeof en = { title: 'Status kurir', sync: 'Sinkronkan Biteship', waiting: 'Menunggu pembaruan kurir', failed: 'Status kurir tidak dapat dimuat', refreshed: 'Sinkronisasi diminta; pembaruan mungkin memerlukan satu menit', updated: 'Terakhir diperiksa', waybill: 'Resi', confirmed: 'Dikonfirmasi', allocated: 'Kurir ditugaskan', pickingUp: 'Menuju penjemputan', picked: 'Sudah dijemput', droppingOff: 'Dalam pengantaran', delivered: 'Terkirim', returnInTransit: 'Dalam pengembalian', returned: 'Dikembalikan', cancelled: 'Dibatalkan', rejected: 'Ditolak', disposed: 'Dimusnahkan', onHold: 'Ditahan', courierNotFound: 'Kurir tidak ditemukan' };
const zh: typeof en = { title: '快递状态', sync: '同步 Biteship', waiting: '等待快递更新', failed: '无法加载快递状态', refreshed: '已请求同步，更新可能需要一分钟', updated: '上次检查', waybill: '运单号', confirmed: '已确认', allocated: '已分配快递员', pickingUp: '正在前往取件', picked: '已取件', droppingOff: '派送中', delivered: '已送达', returnInTransit: '退回途中', returned: '已退回', cancelled: '已取消', rejected: '已拒收', disposed: '已销毁', onHold: '已暂缓', courierNotFound: '未找到快递员' };
i18n.addResourceBundle('en', 'shipment', en);
i18n.addResourceBundle('id', 'shipment', id);
i18n.addResourceBundle('zh', 'shipment', zh);
const statusKeys: Record<string, string> = { picking_up: 'pickingUp', dropping_off: 'droppingOff', return_in_transit: 'returnInTransit', on_hold: 'onHold', courier_not_found: 'courierNotFound' };
interface State { provider_status: string; shipping_synced_at: string | null; tracking_number: string; shipping_status_history: { status: string; provider_at: string | null; observed_at: string }[] }

// Read only the current user's RLS-visible order, including on initial mount.
export function ShipmentStatus({ orderId, admin = false }: { orderId: string; admin?: boolean }) {
    const { t } = useTranslation('shipment');
    const [state, setState] = useState<State | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [revision, setRevision] = useState(0);
    const [message, setMessage] = useState(false);
    useEffect(() => {
        let active = true;
        let sequence = 0;
        setState(null);
        async function reload() {
            const current = ++sequence;
            const { data, error: failure } = await client().from('orders').select('provider_status,shipping_synced_at,tracking_number,shipping_status_history').eq('id', orderId).maybeSingle();
            if (!active || current !== sequence) return;
            setError(failure ? t('failed') : '');
            setState(failure ? null : data as State | null);
        }
        void reload();
        const refresh = () => { if (document.visibilityState !== 'hidden') void reload(); };
        const channel = client().channel('shipment-status:' + orderId + ':' + admin).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'id=eq.' + orderId }, refresh).subscribe();
        const timer = window.setInterval(refresh, 60000);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        const { data: auth } = client().auth.onAuthStateChange(() => { setState(null); refresh(); });
        return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); auth.subscription.unsubscribe(); void client().removeChannel(channel); };
    }, [orderId, admin, revision, t]);
    const label = (status: string) => t(statusKeys[status] || status, { defaultValue: status });
    return <div className="stack">
        <p>{t('title')}: <strong>{state?.provider_status ? label(state.provider_status) : t('waiting')}</strong></p>
        {state?.tracking_number && <p>{t('waybill')}: {state.tracking_number}</p>}
        {state?.shipping_synced_at && <small>{t('updated')}: {new Date(state.shipping_synced_at).toLocaleString(i18n.resolvedLanguage === 'zh' ? 'zh-CN' : i18n.language)}</small>}
        {!!state?.shipping_status_history?.length && <ul>{state.shipping_status_history.map((event, index) => <li key={index}>{label(event.status)} - {new Date(event.provider_at || event.observed_at).toLocaleString(i18n.resolvedLanguage === 'zh' ? 'zh-CN' : i18n.language)}</li>)}</ul>}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{t('refreshed')}</p>}
        {admin && <button type="button" className="button secondary" disabled={busy} onClick={async () => {
            setBusy(true); setError(''); setMessage(false);
            try { await shopAction({ action: 'biteship-sync', orderId }); setMessage(true); setRevision(n => n + 1); }
            catch (e) { setError(errorMessage(e)); }
            finally { setBusy(false); }
        }}>{t('sync')}</button>}
    </div>;
}