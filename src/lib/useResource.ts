import { useEffect, useRef, useState } from 'react';
import { projectStorageKey } from '../../supabaseClient';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 100;
const PERSISTENT_CACHE_PREFIX = projectStorageKey + 'public-resource-cache:v1:';
const resourceCache = new Map<string, { data: unknown; expiresAt: number }>();

function readCache<T>(key: string, persist: boolean): T | null {
    const entry = resourceCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
        resourceCache.delete(key);
        resourceCache.set(key, entry);
        return entry.data as T;
    }
    if (entry)
        resourceCache.delete(key);
    if (!persist || typeof window === 'undefined')
        return null;
    const storageKey = PERSISTENT_CACHE_PREFIX + encodeURIComponent(key);
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw)
            return null;
        const saved: unknown = JSON.parse(raw);
        if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1 || !('expiresAt' in saved) || typeof saved.expiresAt !== 'number' || saved.expiresAt <= Date.now() || !('data' in saved)) {
            window.localStorage.removeItem(storageKey);
            return null;
        }
        writeCache(key, saved.data, false);
        return saved.data as T;
    }
    catch {
        return null;
    }
}

function writeCache<T>(key: string, data: T, persist = false): void {
    resourceCache.delete(key);
    const expiresAt = Date.now() + CACHE_TTL_MS;
    resourceCache.set(key, { data, expiresAt });
    while (resourceCache.size > CACHE_LIMIT)
        resourceCache.delete(resourceCache.keys().next().value as string);
    if (!persist || typeof window === 'undefined')
        return;
    try {
        const storageKey = PERSISTENT_CACHE_PREFIX + encodeURIComponent(key);
        window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, expiresAt, data }));
        const keys: { key: string; expiresAt: number }[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const candidateKey = window.localStorage.key(i);
            if (!candidateKey?.startsWith(PERSISTENT_CACHE_PREFIX))
                continue;
            try {
                const candidate: unknown = JSON.parse(window.localStorage.getItem(candidateKey) || 'null');
                if (candidate && typeof candidate === 'object' && 'expiresAt' in candidate && typeof candidate.expiresAt === 'number')
                    keys.push({ key: candidateKey, expiresAt: candidate.expiresAt });
                else
                    window.localStorage.removeItem(candidateKey);
            }
            catch {
                window.localStorage.removeItem(candidateKey);
            }
        }
        keys.sort((a, b) => b.expiresAt - a.expiresAt);
        for (const stale of keys.slice(CACHE_LIMIT - 1))
            window.localStorage.removeItem(stale.key);
    }
    catch {
        // Persistent caching is optional; continue using the in-memory cache when storage is unavailable.
    }
}

export function clearResourceCache(): void {
    resourceCache.clear();
}

export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>, cacheKey = key, persist = false) {
    const cached = readCache<T>(cacheKey, persist);
    const [state, setState] = useState<{
        key: string;
        data: T | null;
        loading: boolean;
        error: string;
    }>(() => ({ key, data: cached, loading: cached === null, error: '' }));
    const [revision, setRevision] = useState(0);
    const fn = useRef(load);
    fn.current = load;
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        const existing = readCache<T>(cacheKey, persist);
        setState(s => ({ key, data: existing ?? (s.key === key ? s.data : null), loading: existing === null, error: '' }));
        void fn.current(controller.signal).then(data => {
            if (active) {
                writeCache(cacheKey, data, persist);
                setState({ key, data, loading: false, error: '' });
            }
        }).catch(e => {
            if (active)
                setState(s => ({ ...s, key, loading: false, error: e?.message || 'Data tidak dapat dimuat.' }));
        });
        return () => { active = false; controller.abort(); };
    }, [key, cacheKey, persist, revision]);
    return { ...(state.key === key ? state : { key, data: readCache<T>(cacheKey, persist), loading: true, error: '' }), reload: () => setRevision(n => n + 1) };
}
