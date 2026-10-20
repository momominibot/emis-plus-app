import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSession } from './auth/session';
import { LOYALTY_AVAILABLE, fetchMembership } from './loyalty';
import type { Membership } from './types';

/** Signed-in customer's Health Points, refreshed whenever the screen regains focus. */
export function useMembership() {
  const { session, ready } = useSession();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customerId = session?.customer?.id ?? (session ? 'signed-in' : null);

  const reload = useCallback(async () => {
    if (!LOYALTY_AVAILABLE || !customerId) {
      setMembership(null);
      return;
    }
    setLoading(true);
    try {
      setMembership(await fetchMembership());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your Health Points.');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  // Runs on first focus, on every return to the screen, and when the
  // signed-in customer changes; signing out clears the card.
  useFocusEffect(
    useCallback(() => {
      if (ready) reload();
    }, [ready, reload]),
  );

  return { session, ready, membership, loading, error, reload };
}
