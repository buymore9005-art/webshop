declare global {
    interface Window {
        Tawk_API?: {
            onLoad?: () => void;
            maximize?: () => void;
            hideWidget?: () => void;
        };
    }
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
