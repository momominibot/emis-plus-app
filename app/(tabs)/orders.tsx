import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Order } from '@/lib/types';

// Demo orders - shown until Shopify customer auth is connected
const DEMO_ORDERS: Order[] = [
  {
    id: '1',
    orderNumber: '#1042',
    date: '2026-10-01',
    status: 'shipped',
    trackingNumber: 'SGP123456789',
    trackingCompany: 'Ninja Van',
    total: '86.50',
    items: [
      { title: 'Convatec Esenta Adhesive Remover', quantity: 2 },
      { title: 'Ceradan Advanced Emollient Wash 500ml', quantity: 1 },
    ],
  },
  {
    id: '2',
    orderNumber: '#1038',
    date: '2026-09-15',
    status: 'delivered',
    total: '142.00',
    items: [
      { title: 'Coloplast Ostomy Pouch', quantity: 10 },
      { title: 'Compression Stockings 20-30mmHg', quantity: 1 },
    ],
  },
  {
    id: '3',
    orderNumber: '#1031',
    date: '2026-08-28',
    status: 'delivered',
    total: '45.90',
    items: [{ title: 'Difflam Plus Sore Throat Lozenges', quantity: 3 }],
  },
];

const STATUS_CONFIG: Record<Order['status'], { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Pending', color: '#8A5300', bg: '#FFF1D6', icon: 'time' },
  paid: { label: 'Paid', color: '#1D5FA8', bg: '#E6EFFA', icon: 'card' },
  fulfilled: { label: 'Processing', color: '#1D5FA8', bg: '#E6EFFA', icon: 'cube' },
  shipped: { label: 'Shipped', color: '#0B4F4A', bg: '#E3F2EF', icon: 'car' },
  delivered: { label: 'Delivered', color: '#1E7A4C', bg: '#E4F4EA', icon: 'checkmark-circle' },
  cancelled: { label: 'Cancelled', color: '#B42318', bg: '#FDEAE7', icon: 'close-circle' },
};

const FILTERS = ['all', 'active', 'delivered'] as const;

export default function OrdersScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [orders] = useState<Order[]>(DEMO_ORDERS);
  const [filter, setFilter] = useState<typeof FILTERS[number]>('all');

  const filtered = orders.filter(o => {
    if (filter === 'active') return ['shipped', 'paid', 'fulfilled', 'pending'].includes(o.status);
    if (filter === 'delivered') return o.status === 'delivered';
    return true;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Text style={[styles.title, { color: colors.text }]}>Orders</Text>

      {/* Segmented control */}
      <View style={[styles.segmented, { backgroundColor: colors.surfaceSunken }]}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.segment, filter === f && { backgroundColor: colors.surface, ...styles.shadow1 }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.segmentText, { color: filter === f ? colors.text : colors.textSecondary, fontWeight: filter === f ? '600' : '500' }]}>
              {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Delivered'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        {filtered.map(order => {
          const status = STATUS_CONFIG[order.status];
          return (
            <View key={order.id} style={[styles.orderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.orderHeader}>
                <Text style={[styles.orderNumber, { color: colors.text }]}>Order {order.orderNumber}</Text>
                <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                  <Ionicons name={status.icon as any} size={12} color={status.color} />
                  <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>
              <Text style={[styles.orderDate, { color: colors.textSecondary }]}>
                {new Date(order.date).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>

              {order.items.slice(0, 2).map((item, i) => (
                <Text key={i} style={[styles.orderItem, { color: colors.textSecondary }]}>
                  {item.quantity}x {item.title}
                </Text>
              ))}
              {order.items.length > 2 && (
                <Text style={[styles.orderItem, { color: colors.textTertiary }]}>+{order.items.length - 2} more</Text>
              )}

              <View style={[styles.orderFooter, { borderTopColor: colors.border }]}>
                <Text style={[styles.orderTotal, { color: colors.text }]}>Total: S${order.total}</Text>
                {order.trackingNumber && (
                  <View style={styles.trackingBox}>
                    <Text style={[styles.trackingLabel, { color: colors.textSecondary }]}>{order.trackingCompany}</Text>
                    <Text style={[styles.trackingNumber, { color: colors.primary }]}>{order.trackingNumber}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={colors.textTertiary} />
            <Text style={{ color: colors.textSecondary, fontSize: 16, marginTop: 12 }}>No orders in this category</Text>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontWeight: '700', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  segmented: { flexDirection: 'row', marginHorizontal: 20, padding: 4, borderRadius: 12, gap: 4 },
  segment: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 14 },
  shadow1: { shadowColor: '#1B2B2A', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  orderCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNumber: { fontSize: 16, fontWeight: '700' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  orderDate: { fontSize: 13, marginTop: 4, marginBottom: 10 },
  orderItem: { fontSize: 13, marginBottom: 3 },
  orderFooter: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  orderTotal: { fontSize: 15, fontWeight: '700' },
  trackingBox: { alignItems: 'flex-end' },
  trackingLabel: { fontSize: 11 },
  trackingNumber: { fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  empty: { alignItems: 'center', padding: 40, gap: 4 },
});
