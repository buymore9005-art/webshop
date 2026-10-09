import { useEffect, useRef, useState } from 'react';
// Explicit keys preserve view state while stale requests cannot replace newer results.
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
    const [state, setState] = useState<{
        key: string;
        data: T | null;
        loading: boolean;
        error: string;
    }>({ key, data: null, loading: true, error: '' });
    const [revision, setRevision] = useState(0);
    const fn = useRef(load);
    fn.current = load;
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setState(s => ({ key, data: s.key === key ? s.data : null, loading: true, error: '' }));
        void fn.current(controller.signal).then(data => { if (active)
            setState({ key, data, loading: false, error: '' }); }).catch(e => { if (active)
            setState(s => ({ ...s, key, loading: false, error: e?.message || 'Data tidak dapat dimuat.' })); });
        return () => { active = false; controller.abort(); };
    }, [key, revision]);
    return { ...(state.key === key ? state : { key, data: null, loading: true, error: '' }), reload: () => setRevision(n => n + 1) };
}
