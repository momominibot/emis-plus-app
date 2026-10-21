// Paid emis.asia orders matched to the signed-in member by email (recorded
// by the Health Points webhook), with the points each earned. Full order
// details and delivery tracking stay on emis.asia.

import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import SignInPanel from '@/components/SignInPanel';
import { STORE_URL } from '@/lib/shopify';
import { AUTH_AVAILABLE } from '@/lib/auth/config';
import { LOYALTY_AVAILABLE } from '@/lib/loyalty';
import { useMembership } from '@/lib/useMembership';
import type { MemberOrder } from '@/lib/types';

const money = (cents: number) => 'S$' + (cents / 100).toFixed(2);

export default function OrdersScreen() {
  const colors = Colors[useColorScheme()];
  const router = useRouter();
  const { user, ready, membership, loading, error, reload } = useMembership();
  const openAccount = () => WebBrowser.openBrowserAsync(STORE_URL + '/account');

  if (!ready) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  if (!AUTH_AVAILABLE || !LOYALTY_AVAILABLE || !user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        {AUTH_AVAILABLE && !user ? (
          <SignInPanel intro="Sign in with the email you shop with on emis.asia to see your orders and their Health Points here." />
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.icon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="cube-outline" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Your orders</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Order history in the app arrives with EMIS+ accounts. For now, you can see your orders and delivery updates in
              your emis.asia account.
            </Text>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={openAccount}>
              <Text style={styles.btnText}>Open my emis.asia account</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.list, { backgroundColor: colors.background }]} edges={['bottom']}>
      <FlatList<MemberOrder>
        data={membership?.orders ?? []}
        keyExtractor={(o) => o.orderId}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading && membership !== null} onRefresh={reload} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            {error ? (
              <TouchableOpacity onPress={reload}>
                <Text style={[styles.body, { color: colors.danger, textAlign: 'left' }]}>{error} Tap to retry.</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              Paid orders placed with {user.email ?? 'your email'}. Orders show here a few minutes after payment.
            </Text>
          </View>
        }
        ListEmptyComponent={
          membership === null ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.text }]}>No orders yet</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                Paid orders placed on emis.asia with this email address will show here.
              </Text>
              <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => router.push('/shop')}>
                <Text style={styles.btnText}>Browse the shop</Text>
              </TouchableOpacity>
            </View>
          )
        }
        ListFooterComponent={
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primaryLight }]} onPress={openAccount}>
            <Text style={[styles.btnText, { color: colors.primaryDark }]}>Full order details on emis.asia</Text>
          </TouchableOpacity>
        }
        renderItem={({ item: o }) => (
          <View style={[styles.order, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.orderHead}>
              <Text style={[styles.orderName, { color: colors.text }]}>{o.name || 'Order'}</Text>
              <Text style={[styles.points, { color: colors.primary, backgroundColor: colors.primaryLight }]}>
                {o.points > 0 ? '+' : ''}{o.points} points
              </Text>
            </View>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {new Date(o.processedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })} · {money(o.amountCents)}
              {o.refundedCents > 0 ? ` · ${o.refundedCents >= o.amountCents ? 'refunded' : money(o.refundedCents) + ' refunded'}` : ''}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 20 },
  list: { flex: 1 },
  card: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center', gap: 12, maxWidth: 520, alignSelf: 'stretch' },
  icon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  note: { fontSize: 13, lineHeight: 18 },
  btn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignSelf: 'stretch', alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  order: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 6, maxWidth: 640, width: '100%', alignSelf: 'center' },
  orderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  orderName: { fontSize: 17, fontWeight: '700' },
  points: { fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  meta: { fontSize: 13 },
});
