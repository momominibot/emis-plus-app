// Order history needs the customer to sign in (Shopify Customer Account API),
// which is not connected yet. Until then, send people to their emis.asia
// account rather than showing placeholder orders.

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { STORE_URL } from '@/lib/shopify';

export default function OrdersScreen() {
  const colors = Colors[useColorScheme()];
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="cube-outline" size={28} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Your orders</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Order tracking in the app arrives with EMIS+ sign-in. For now, you can see your orders and delivery updates in
          your emis.asia account.
        </Text>
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => WebBrowser.openBrowserAsync(STORE_URL + '/account')}>
          <Text style={styles.btnText}>Open my emis.asia account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center', gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  icon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  btn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignSelf: 'stretch', alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
