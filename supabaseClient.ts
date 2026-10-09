/// <reference path="./src/vite-env.d.ts" />
import { createClient } from '@supabase/supabase-js';
const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
function validate(): string {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1')
            return 'URL Supabase harus HTTPS.';
    }
    catch {
        return 'Isi VITE_SUPABASE_URL di environment terlebih dahulu.';
    }
    if (!key || key.includes('YOUR_'))
        return 'Isi VITE_SUPABASE_ANON_KEY dengan publishable/anon key project baru.';
    if (key.startsWith('sb_secret_'))
        return 'Server secret tidak boleh digunakan pada frontend.';
    if (!key.startsWith('sb_publishable_')) {
        try {
            const body = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (body.role !== 'anon')
                return 'Gunakan anon key, bukan service-role key.';
        }
        catch {
            return 'Format publishable/anon key tidak valid.';
        }
    }
    return '';
}
export const configurationError = validate();
// Never connect to the old project, and never replace a missing configuration with dummy data.
export const supabase = configurationError ? null : createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
export function client() { if (!supabase)
    throw new Error(configurationError); return supabase; }
export const projectStorageKey = 'zyha:' + url + ':';
