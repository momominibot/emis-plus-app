import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSession, type Session } from './auth/session';
import { LOYALTY_AVAILABLE, fetchMembership } from './loyalty';
import type { Membership } from './types';

/** Identifies whose data a screen is showing; null when signed out. */
export function sessionKey(session: Session | null): string | null {
  if (!session) return null;
  return session.customer?.id ?? 'session:' + session.idToken.slice(-16);
}

/** Signed-in customer's Health Points, refreshed whenever the screen regains focus. */
export function useMembership() {
  const { session, ready } = useSession();
  const key = sessionKey(session);
  const keyRef = useRef(key);
  // Results are stored with the account they belong to and only shown for it.
  const [result, setResult] = useState<{ owner: string; membership: Membership | null; error: string | null } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const reload = useCallback(async () => {
    if (!LOYALTY_AVAILABLE || !key) return;
    const askedFor = key;
    setLoading(true);
    try {
      const m = await fetchMembership();
      if (keyRef.current === askedFor) setResult({ owner: askedFor, membership: m, error: null });
    } catch (err) {
      if (keyRef.current === askedFor) {
        const message = err instanceof Error ? err.message : 'Could not load your Health Points.';
        setResult((prev) => ({ owner: askedFor, membership: prev?.owner === askedFor ? prev.membership : null, error: message }));
      }
    } finally {
      setLoading(false);
    }
  }, [key]);

  // Runs on first focus, on every return to the screen, and when the
  // signed-in customer changes.
  useFocusEffect(
    useCallback(() => {
      if (ready) reload();
    }, [ready, reload]),
  );

  // Only ever hand out data that belongs to the current session.
  const mine = key !== null && result?.owner === key ? result : null;
  return { session, ready, membership: mine?.membership ?? null, loading, error: mine?.error ?? null, reload };
}
