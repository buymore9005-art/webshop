import { HttpError, string } from './validation.ts';
import { env } from './server.ts';

const API_ORIGIN = 'https://api.biteship.com';

async function request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const key = env('BITESHIP_API_KEY');
    let response: Response;
    try {
        response = await fetch(API_ORIGIN + path, {
            ...init,
            signal: AbortSignal.timeout(15000),
            headers: {
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json',
                ...(init.headers || {}),
            },
        });
    }
    catch {
        throw new HttpError(503, 'Tidak dapat menghubungi Biteship. Periksa koneksi dan status booking sebelum mencoba kembali.');
    }
    let data: unknown;
    try {
        data = await response.json();
    }
    catch {
        throw new HttpError(502, 'Respons Biteship tidak dapat dibaca.');
    }
    if (!response.ok) {
        console.error('Biteship request failed', response.status, path);
        throw new HttpError(502, 'Biteship menolak permintaan. Periksa konfigurasi akun, lokasi, dan data paket.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new HttpError(502, 'Respons Biteship tidak valid.');
    return data as Record<string, unknown>;
}

export async function searchAreas(input: unknown) {
    const query = string(input, 'Kata kunci lokasi', 2, 100);
    const params = new URLSearchParams({ countries: 'ID', input: query, type: 'single' });
    const result = await request('/v1/maps/areas?' + params.toString(), { method: 'GET' });
    if (!Array.isArray(result.areas))
        throw new HttpError(502, 'Daftar area Biteship tidak tersedia.');
    const areas = result.areas.slice(0, 20).flatMap((entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            return [];
        const area = entry as Record<string, unknown>;
        if (typeof area.id !== 'string' || typeof area.name !== 'string')
            return [];
        const parts = [
            area.name,
            area.administrative_division_level_3_name,
            area.administrative_division_level_2_name,
            area.administrative_division_level_1_name,
        ].filter((part): part is string => typeof part === 'string' && !!part.trim());
        const postal = area.postal_code === null || area.postal_code === undefined ? '' : String(area.postal_code);
        return [{
            id: area.id.slice(0, 120),
            name: area.name.slice(0, 200),
            postal_code: postal.slice(0, 5),
            label: [...new Set(parts)].join(', ').slice(0, 300),
            district: typeof area.administrative_division_level_3_name === 'string' ? area.administrative_division_level_3_name.slice(0, 100) : '',
            city: typeof area.administrative_division_level_2_name === 'string' ? area.administrative_division_level_2_name.slice(0, 100) : '',
            province: typeof area.administrative_division_level_1_name === 'string' ? area.administrative_division_level_1_name.slice(0, 100) : '',
        }];
    });
    return areas;
}

export interface BiteshipRateItem {
    name: string;
    description: string;
    category: string;
    value: number;
    quantity: number;
    length: number;
    width: number;
    height: number;
    weight: number;
}

export async function getRates(input: {
    origin_area_id: string;
    destination_area_id: string;
    couriers: string;
    items: BiteshipRateItem[];
}) {
    return request('/v1/rates/couriers', {
        method: 'POST',
        body: JSON.stringify(input),
    });
}

export async function createOrder(input: Record<string, unknown>) {
    return request('/v1/orders', {
        method: 'POST',
        body: JSON.stringify(input),
    });
}
