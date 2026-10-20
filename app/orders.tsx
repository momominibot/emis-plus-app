// The signed-in customer's orders from the Shopify Customer Account API.
// Without sign-in (or before it is configured) the screen points to the
// customer's emis.asia account instead of showing placeholder orders.

import { useCallback, useState } from 'react';
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

function money(m: { amount: string; currencyCode: string }) {
  const n = Number(m.amount);
  const value = Number.isFinite(n) ? n.toFixed(2) : m.amount;
  return m.currencyCode === 'SGD' ? 'S$' + value : value + ' ' + m.currencyCode;
}

export default function OrdersScreen() {
  const colors = Colors[useColorScheme()];
  const router = useRouter();
  const { session, ready } = useSession();
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInMsg, setSignInMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setOrders(await fetchOrders());
      setError(null);
    } catch (err) {
      if (!(err instanceof NotSignedInError)) setError(err instanceof Error ? err.message : 'Could not load your orders.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
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
                style={[styles.btn, { backgroundColor: colors.primary }]}
                onPress={async () => {
                  const r = await signIn();
                  if (r && !r.ok) setSignInMsg(r.message);
                }}
              >
                <Text style={styles.btnText}>Sign in with emis.asia</Text>
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
        refreshControl={<RefreshControl refreshing={loading && orders !== null} onRefresh={load} tintColor={colors.primary} />}
        ListHeaderComponent={
          error ? (
            <TouchableOpacity onPress={load}>
              <Text style={[styles.body, { color: colors.danger, textAlign: 'left' }]}>{error} Tap to retry.</Text>
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
        renderItem={({ item: o }) => {
          const track = o.tracking.find((t) => t.url);
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
                {track?.url && (
                  <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.primary }]} onPress={() => WebBrowser.openBrowserAsync(track.url!)}>
                    <Text style={styles.smallBtnText}>Track parcel</Text>
                  </TouchableOpacity>
                )}
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
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  smallBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  smallBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
