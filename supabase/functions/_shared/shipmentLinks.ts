export function safeShippingUrl(value: unknown): string {
    if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\/[^/?#]/i.test(value)
        || /[\s\\\u0000-\u001f\u007f]/.test(value)) return '';
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : '';
    } catch {
        return '';
    }
}

export function providerShipmentLinks(order: Record<string, unknown>) {
    const courier = order.courier && typeof order.courier === 'object' && !Array.isArray(order.courier)
        ? order.courier as Record<string, unknown> : {};
    return {
        label_url: safeShippingUrl(order.label_url) || safeShippingUrl(courier.label_url),
        tracking_url: safeShippingUrl(courier.link),
    };
}

export function visibleShipmentLinks(shipment: { label_url?: unknown; label_url_verified?: unknown; tracking_url?: unknown } | null | undefined) {
    return {
        label_url: shipment?.label_url_verified === true ? safeShippingUrl(shipment.label_url) : '',
        tracking_url: safeShippingUrl(shipment?.tracking_url),
    };
}