export const templateDefaults = {
    version: 1, paper: '100x150', width: 100, height: 150, margin: 4, padding: 2,
    fontSize: 10, headingSize: 14, lineHeight: 1.3, border: 1, logoWidth: 32,
    barcodeHeight: 15, moduleWidth: 0.25, quietZone: 10,
    layout: 'columns', alignment: 'center', title: '', footer: '',
    courierLogo: true, biteshipLogo: true, sender: true, senderPhone: true,
    recipientPhone: true, products: true, notes: true, reference: true,
    referenceBarcode: true, totals: true, shippingFee: true, routing: true,
};
export type LabelTemplate = typeof templateDefaults;
export const numericLimits: Record<string, [number, number, number]> = {
    width: [80, 210, 1], height: [80, 297, 1], margin: [2, 10, 0.5], padding: [1, 5, 0.5],
    fontSize: [9, 16, 1], headingSize: [12, 22, 1], lineHeight: [1.1, 1.8, 0.1],
    border: [0.5, 3, 0.5], logoWidth: [15, 40, 1], barcodeHeight: [15, 30, 1],
    moduleWidth: [0.25, 0.5, 0.01], quietZone: [10, 20, 1],
};
// Missing settings alone use defaults. Invalid persisted values fail closed, never silently clamp.
export function normalizeLabelTemplate(value?: unknown): LabelTemplate {
    if (value === undefined || value === null) return { ...templateDefaults };
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Template label harus berupa objek.');
    const input = value as Record<string, unknown>;
    const result = { ...templateDefaults };
    for (const key of Object.keys(input)) {
        if (!Object.hasOwn(templateDefaults, key)) throw new Error('Properti template tidak dikenal: ' + key);
        const v = input[key];
        const limits = numericLimits[key];
        if (limits) {
            if (typeof v !== 'number' || !Number.isFinite(v) || v < limits[0] || v > limits[1]) throw new Error(`${key}: batas ${limits[0]} - ${limits[1]}.`);
        } else if (typeof v !== typeof templateDefaults[key as keyof LabelTemplate]) throw new Error('Tipe template salah: ' + key);
        Object.assign(result, { [key]: v });
    }
    if (result.version !== 1 || !['100x150', '100x100', 'A6', 'custom'].includes(result.paper)
        || !['columns', 'stacked'].includes(result.layout) || !['left', 'center', 'right'].includes(result.alignment)
        || result.title.length > 80 || result.footer.length > 180 || /[\x00-\x08\x0b-\x1f]/.test(result.title + result.footer)
        || !Number.isInteger(result.quietZone)) throw new Error('Format template tidak valid.');
    if (result.paper !== 'custom') {
        [result.width, result.height] = result.paper === 'A6' ? [105, 148] : result.paper === '100x100' ? [100, 100] : [100, 150];
    }
    return result;
}
export function barcodeAvailableWidth(t: LabelTemplate) {
    return t.width - 2 * t.margin - 2 * t.padding - 2 * t.border * 25.4 / 96 - 1;
}