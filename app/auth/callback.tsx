// Supabase sends the browser back here after Sign in with Google (or Apple
// outside iOS), with ?code=... (PKCE). Web lands here after a full-page
// redirect; on Android the router may also open it while the in-app browser
// finishes the same sign-in (the exchange is shared, not repeated).

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { completeOAuthRedirect } from '@/lib/auth/session';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function AuthCallbackScreen() {
  const colors = Colors[useColorScheme()];
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    completeOAuthRedirect({
      code: first(params.code),
      error: first(params.error),
      error_description: first(params.error_description),
    }).then((result) => {
      if (!alive) return;
      if (result === null || result.ok) router.replace('/account');
      else setMessage(result.message);
    });
    return () => {
      alive = false;
    };
    // Run once for the redirect we landed on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {message ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Sign-in did not finish</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{message}</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => router.replace('/account')}>
            <Text style={styles.btnText}>Back to my account</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.body, { color: colors.textSecondary }]}>Signing you in...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
