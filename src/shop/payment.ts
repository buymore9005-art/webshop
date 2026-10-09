interface Snap {
    pay(token: string, options: {
        onSuccess: () => void;
        onPending: () => void;
        onError: () => void;
        onClose: () => void;
    }): void;
}
declare global {
    interface Window {
        snap?: Snap;
        Tawk_API?: {
            onLoad?: () => void;
            maximize?: () => void;
            hideWidget?: () => void;
        };
    }
}
let pending: Promise<void> | null = null, loadedKey = '';
export async function openSnap(token: string, mode: string, clientKey: string, onChange: () => void) {
    if (!clientKey || !['sandbox', 'production'].includes(mode))
        throw new Error('Konfigurasi Midtrans belum lengkap.');
    const key = mode + ':' + clientKey;
    if (loadedKey !== key) {
        document.getElementById('zyha-snap')?.remove();
        window.snap = undefined;
        pending = null;
        loadedKey = key;
    }
    if (!window.snap && !pending)
        pending = new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.id = 'zyha-snap';
            script.src = mode === 'production' ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js';
            script.dataset.clientKey = clientKey;
            const timer = window.setTimeout(() => { script.remove(); pending = null; reject(new Error('Script pembayaran belum termuat. Coba lagi.')); }, 15000);
            script.onload = () => { clearTimeout(timer); if (window.snap)
                resolve();
            else {
                pending = null;
                reject(new Error('Midtrans belum siap.'));
            } };
            script.onerror = () => { clearTimeout(timer); script.remove(); pending = null; reject(new Error('Koneksi pembayaran gagal.')); };
            document.body.appendChild(script);
        });
    if (pending)
        await pending;
    if (!window.snap)
        throw new Error('Midtrans belum siap.');
    window.snap.pay(token, { onSuccess: onChange, onPending: onChange, onError: onChange, onClose: onChange });
}
export async function openLiveChat() {
    const property = import.meta.env.VITE_TAWK_PROPERTY_ID || '', widget = import.meta.env.VITE_TAWK_WIDGET_ID || '';
    if (!/^[a-zA-Z0-9]+$/.test(property) || !/^[a-zA-Z0-9]+$/.test(widget))
        throw new Error('Live chat belum dikonfigurasi. Gunakan WhatsApp.');
    if (window.Tawk_API?.maximize) {
        window.Tawk_API.maximize();
        return;
    }
    if (document.getElementById('zyha-chat'))
        return;
    window.Tawk_API = { onLoad: () => window.Tawk_API?.maximize?.() };
    const script = document.createElement('script');
    script.id = 'zyha-chat';
    script.src = `https://embed.tawk.to/${property}/${widget}`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);
}
