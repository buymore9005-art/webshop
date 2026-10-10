import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { client } from '../../supabaseClient';
import { clearResourceCache } from './useResource';
export function useCustomerSession() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        let currentUserId: string | null = null;
        const { data: { subscription } } = client().auth.onAuthStateChange((_event, next) => {
            if (active) {
                const nextUserId = next?.user.id || null;
                if (currentUserId !== nextUserId)
                    clearResourceCache();
                currentUserId = nextUserId;
                setSession(next);
                setLoading(false);
                setError('');
            }
        });
        void client().auth.getSession().then(({ data, error: sessionError }) => {
            if (!active)
                return;
            if (sessionError)
                throw sessionError;
            setSession(data.session);
            setLoading(false);
        }).catch(e => {
            if (active) {
                setError(e instanceof Error ? e.message : 'Sesi pelanggan tidak dapat dimuat.');
                setLoading(false);
            }
        });
        return () => { active = false; subscription.unsubscribe(); };
    }, []);
    return { session, loading, error };
}
