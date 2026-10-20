// The signed-in customer's orders from the Shopify Customer Account API.
// Without sign-in (or before it is configured) the screen points to the
// customer's emis.asia account instead of showing placeholder orders.

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { STORE_URL } from '@/lib/shopify';
import { SIGN_IN_AVAILABLE } from '@/lib/auth/config';
import { signIn, useSession } from '@/lib/auth/session';
import { type CustomerOrder, NotSignedInError, fetchOrders, orderStatusLabel } from '@/lib/customer';
import { sessionKey } from '@/lib/useMembership';

function money(m: { amount: string; currencyCode: string }) {
  const n = Number(m.amount);
  const value = Number.isFinite(n) ? n.toFixed(2) : m.amount;
  return m.currencyCode === 'SGD' ? 'S$' + value : value + ' ' + m.currencyCode;
}

export default function OrdersScreen() {
  const colors = Colors[useColorScheme()];
  const router = useRouter();
  const { session, ready } = useSession();
  const key = sessionKey(session);
  const keyRef = useRef(key);
  // Bumped by every fresh load; an older "show more" response is then dropped
  // instead of being appended to the new first page.
  const requestRef = useRef(0);
  // Results are stored with the account they belong to and only shown for it.
  const [result, setResult] = useState<{ owner: string; orders: CustomerOrder[]; nextCursor: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ owner: string; message: string } | null>(null);
  const mine = key !== null && result?.owner === key ? result : null;
  const orders = mine ? mine.orders : null;
  const nextCursor = mine ? mine.nextCursor : null;
  const [signingIn, setSigningIn] = useState(false);
  const [signInMsg, setSignInMsg] = useState<string | null>(null);

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const load = useCallback(async (more = false) => {
    if (!key) return;
    const askedFor = key;
    const request = more ? requestRef.current : ++requestRef.current;
    setLoading(true);
    try {
      const page = await fetchOrders(more ? nextCursor : null);
      // Signed out, switched account, or refreshed while this was loading.
      if (keyRef.current !== askedFor || requestRef.current !== request) return;
      setResult((prev) => ({
        owner: askedFor,
        orders: more && prev?.owner === askedFor ? [...prev.orders, ...page.orders] : page.orders,
        nextCursor: page.nextCursor,
      }));
      setError(null);
    } catch (err) {
      if (keyRef.current !== askedFor || requestRef.current !== request) return;
      if (!(err instanceof NotSignedInError)) {
        setError({ owner: askedFor, message: err instanceof Error ? err.message : 'Could not load your orders.' });
      }
    } finally {
      // Only the newest load decides; an outdated one must not re-enable "show more" mid-refresh.
      if (requestRef.current === request) setLoading(false);
    }
  }, [key, nextCursor]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Reload on focus and on account change only, not when the cursor moves.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]),
  );

  if (!ready) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  }

  if (!SIGN_IN_AVAILABLE || !session) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.icon, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="cube-outline" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Your orders</Text>
          {SIGN_IN_AVAILABLE ? (
            <>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                Sign in with your emis.asia account to see your orders and delivery updates here.
              </Text>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary, opacity: signingIn ? 0.6 : 1 }]}
                disabled={signingIn}
                onPress={async () => {
                  setSigningIn(true);
                  setSignInMsg(null);
                  const r = await signIn();
                  setSigningIn(false);
                  if (r && !r.ok) setSignInMsg(r.message);
                }}
              >
                <Text style={styles.btnText}>{signingIn ? 'Opening sign-in...' : 'Sign in with emis.asia'}</Text>
              </TouchableOpacity>
              {signInMsg && <Text style={[styles.body, { color: colors.danger }]}>{signInMsg}</Text>}
            </>
          ) : (
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Order tracking in the app arrives with EMIS+ sign-in. For now, you can see your orders and delivery updates in
              your emis.asia account.
            </Text>
          )}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: SIGN_IN_AVAILABLE ? colors.primaryLight : colors.primary }]}
            onPress={() => WebBrowser.openBrowserAsync(STORE_URL + '/account')}
          >
            <Text style={[styles.btnText, SIGN_IN_AVAILABLE && { color: colors.primaryDark }]}>Open my emis.asia account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.list, { backgroundColor: colors.background }]} edges={['bottom']}>
      <FlatList
        data={orders || []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading && orders !== null} onRefresh={() => load()} tintColor={colors.primary} />}
        ListHeaderComponent={
          error && error.owner === key ? (
            <TouchableOpacity onPress={() => load()}>
              <Text style={[styles.body, { color: colors.danger, textAlign: 'left' }]}>{error.message} Tap to retry.</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          orders === null ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.text }]}>No orders yet</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>Orders you place on emis.asia with this account will show here.</Text>
              <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => router.push('/shop')}>
                <Text style={styles.btnText}>Browse the shop</Text>
              </TouchableOpacity>
            </View>
          )
        }
        ListFooterComponent={
          nextCursor ? (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primaryLight, opacity: loading ? 0.6 : 1 }]}
              disabled={loading}
              onPress={() => load(true)}
            >
              <Text style={[styles.btnText, { color: colors.primaryDark }]}>{loading ? 'Loading...' : 'Show older orders'}</Text>
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item: o }) => {
          const parcels = o.tracking.filter((t) => t.url);
          return (
            <View style={[styles.order, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.orderHead}>
                <Text style={[styles.orderName, { color: colors.text }]}>{o.name}</Text>
                <Text style={[styles.status, { color: colors.primary, backgroundColor: colors.primaryLight }]}>{orderStatusLabel(o)}</Text>
              </View>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {new Date(o.processedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })} · {money(o.total)}
              </Text>
              {o.items.map((item, i) => (
                <View key={i} style={styles.item}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.thumb} resizeMode="contain" />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: colors.surfaceSunken }]} />
                  )}
                  <Text style={[styles.itemText, { color: colors.text }]} numberOfLines={2}>
                    {item.quantity} × {item.title}
                  </Text>
                </View>
              ))}
              <View style={styles.actions}>
                {parcels.map((parcel, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                    onPress={() => WebBrowser.openBrowserAsync(parcel.url!)}
                  >
                    <Text style={styles.smallBtnText}>{parcels.length > 1 ? `Track parcel ${i + 1}` : 'Track parcel'}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: colors.primaryLight }]}
                  onPress={() => WebBrowser.openBrowserAsync(o.statusPageUrl)}
                >
                  <Text style={[styles.smallBtnText, { color: colors.primaryDark }]}>Order details</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  list: { flex: 1 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center', gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  icon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  btn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignSelf: 'stretch', alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  order: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8, maxWidth: 640, width: '100%', alignSelf: 'center' },
  orderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  orderName: { fontSize: 17, fontWeight: '700' },
  status: { fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  meta: { fontSize: 13 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#fff' },
  itemText: { flex: 1, fontSize: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  smallBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  smallBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
