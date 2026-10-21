import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { AUTH_AVAILABLE } from '@/lib/auth/config';
import { LOYALTY_AVAILABLE } from '@/lib/loyalty';
import { getNewProducts } from '@/lib/shopify';
import { useMembership } from '@/lib/useMembership';
import { Product, TIER_CONFIG } from '@/lib/types';

const SHOP_BY_NEED = [
  { id: 'wound', label: 'Wound Care', icon: 'bandage', handle: 'wound-care-supplies-singapore' },
  { id: 'ostomy', label: 'Ostomy', icon: 'water', handle: 'ostomy-products' },
  { id: 'compression', label: 'Compression', icon: 'fitness', handle: 'compression-stocking' },
  { id: 'hygiene', label: 'Hygiene', icon: 'heart', handle: 'hygiene-and-infection-control' },
];

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const router = useRouter();
  const { user, membership } = useMembership();
  const [newProducts, setNewProducts] = useState<Product[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const products = await getNewProducts(6);
      setNewProducts(products);
    } catch { /* Shopify not configured */ }
  }

  const firstName = user?.name || null;
  const tier = TIER_CONFIG[membership?.tier ?? 'silver'];
  const totalSpent = (membership?.totalSpentCents ?? 0) / 100;
  const nextTier = membership?.tier === 'silver' ? TIER_CONFIG.gold : membership?.tier === 'gold' ? TIER_CONFIG.diamond : null;
  const progress = nextTier ? Math.min(100, (totalSpent / nextTier.minSpend) * 100) : 100;
  const rewardsHint = !AUTH_AVAILABLE || !LOYALTY_AVAILABLE
    ? 'Health Points launch soon with EMIS+ accounts.'
    : !user
      ? 'Sign in to collect Health Points on paid orders.'
      : null;
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Greeting row */}
        <View style={styles.greetingRow}>
          <View>
            <Text style={[styles.greetingDate, { color: colors.textSecondary }]}>
              {new Date().toLocaleDateString('en-SG', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
            <Text style={[styles.greetingName, { color: colors.text }]}>
              {greeting}, {firstName || 'there'}
            </Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.avatarText, { color: colors.primaryDark }]}>
              {firstName?.[0]?.toUpperCase() || 'G'}
            </Text>
          </View>
        </View>

        {/* Search field (navigates to Shop) */}
        <TouchableOpacity
          style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}
          onPress={() => router.push('/shop')}
        >
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <Text style={[styles.searchPlaceholder, { color: colors.textTertiary }]}>Search products...</Text>
        </TouchableOpacity>

        {/* Shop by need 2x2 grid */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Shop by need</Text>
        <View style={styles.needGrid}>
          {SHOP_BY_NEED.map(need => (
            <Link key={need.id} href={{ pathname: '/shop', params: { category: need.handle } }} asChild>
              <TouchableOpacity style={StyleSheet.flatten([styles.needTile, { backgroundColor: colors.surface, borderColor: colors.border }])}>
                <View style={[styles.needIcon, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name={need.icon as any} size={22} color={colors.primary} />
                </View>
                <Text style={[styles.needLabel, { color: colors.text }]}>{need.label}</Text>
              </TouchableOpacity>
            </Link>
          ))}
        </View>

        {/* AI Assistant card */}
        <Link href="/ai-assistant" asChild>
          <TouchableOpacity style={StyleSheet.flatten([styles.aiCard, { backgroundColor: colors.primaryLight }])}>
            <View style={[styles.aiIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="chatbubble" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.aiTitle, { color: colors.primaryDark }]}>Not sure what to choose?</Text>
              <Text style={[styles.aiSubtitle, { color: colors.textSecondary }]}>
                Ask our product assistant. Product help only, not medical advice.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
        </Link>

        {/* Learn card */}
        <Link href="/learn" asChild>
          <TouchableOpacity style={StyleSheet.flatten([styles.rewardsRow, { backgroundColor: colors.surface, borderColor: colors.border }])}>
            <View style={[styles.aiIcon, { backgroundColor: colors.accentLight }]}>
              <Ionicons name="book" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.aiTitle, { color: colors.text }]}>Learn</Text>
              <Text style={[styles.aiSubtitle, { color: colors.textSecondary }]}>
                Plain-language guides on wound healing, stoma care and nutrition.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </Link>

        {/* Rewards compact row */}
        <Link href="/account" asChild>
          <TouchableOpacity style={StyleSheet.flatten([styles.rewardsRow, { backgroundColor: colors.surface, borderColor: colors.border }])}>
            <View style={{ flex: 1 }}>
              {rewardsHint ? (
                <>
                  <Text style={[styles.aiTitle, { color: colors.text }]}>Health Points</Text>
                  <Text style={[styles.aiSubtitle, { color: colors.textSecondary }]}>{rewardsHint}</Text>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={[styles.pointsValue, { color: colors.text }]}>{membership ? membership.points : '-'}</Text>
                    <Text style={[styles.pointsLabel, { color: colors.textSecondary }]}>Health Points</Text>
                    {membership && (
                      <View style={[styles.tierBadge, { backgroundColor: tier.color + '20' }]}>
                        <Text style={[styles.tierText, { color: tier.color }]}>{tier.name}</Text>
                      </View>
                    )}
                  </View>
                  {membership && nextTier && (
                    <View style={{ marginTop: 8 }}>
                      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                        <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.accent }]} />
                      </View>
                      <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                        S${Math.max(nextTier.minSpend - totalSpent, 0).toFixed(2)} to {nextTier.name}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </Link>

        {/* New arrivals */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>New arrivals</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
          {newProducts.length > 0 ? newProducts.map(p => (
            <Link key={p.id} href={`/product/${p.handle}`} asChild>
              <TouchableOpacity style={StyleSheet.flatten([styles.productCard, { backgroundColor: colors.surface, borderColor: colors.border }])}>
                {p.image ? (
                  <Image source={{ uri: p.image }} style={styles.productImage} resizeMode="contain" />
                ) : (
                  <View style={[styles.productImage, { backgroundColor: colors.surfaceSunken }]} />
                )}
                <Text style={[styles.productName, { color: colors.text }]} numberOfLines={2}>{p.title}</Text>
                <Text style={[styles.productPrice, { color: colors.text }]}>S${p.price}</Text>
              </TouchableOpacity>
            </Link>
          )) : (
            <View style={[styles.productCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.productImage, { backgroundColor: colors.surfaceSunken }]} />
              <Text style={[styles.productName, { color: colors.text }]}>New products coming soon</Text>
              <Text style={[styles.productPrice, { color: colors.textTertiary }]}>--</Text>
            </View>
          )}
        </ScrollView>

        {/* Trust footer */}
        <View style={[styles.trustFooter, { backgroundColor: colors.surfaceSunken }]}>
          <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
          <Text style={[styles.trustText, { color: colors.textSecondary }]}>
            Authorised distributor. Singapore-based. GST-inclusive pricing.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  greetingDate: { fontSize: 13, fontWeight: '500' },
  greetingName: { fontSize: 24, fontWeight: '700', marginTop: 2 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, paddingHorizontal: 16, height: 52, borderRadius: 12, borderWidth: 1.5, gap: 10 },
  searchPlaceholder: { fontSize: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '700', paddingHorizontal: 20, marginTop: 24, marginBottom: 12 },
  needGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 12 },
  needTile: { width: '47%', aspectRatio: 1.6, borderRadius: 16, borderWidth: 1, padding: 14, justifyContent: 'space-between' },
  needIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  needLabel: { fontSize: 15, fontWeight: '600' },
  aiCard: { flexDirection: 'row', alignItems: 'center', margin: 20, padding: 16, borderRadius: 16, gap: 14 },
  aiIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  aiTitle: { fontSize: 16, fontWeight: '700' },
  aiSubtitle: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  rewardsRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, padding: 16, borderRadius: 16, borderWidth: 1 },
  pointsValue: { fontSize: 28, fontWeight: '700' },
  pointsLabel: { fontSize: 14, fontWeight: '500' },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tierText: { fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 12, marginTop: 4 },
  horizontalScroll: { paddingHorizontal: 20, gap: 12 },
  productCard: { width: 150, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  productImage: { width: '100%', height: 130, backgroundColor: '#fff' },
  productName: { fontSize: 13, fontWeight: '600', padding: 10, paddingBottom: 4, minHeight: 48 },
  productPrice: { fontSize: 15, fontWeight: '700', paddingHorizontal: 10, paddingBottom: 10 },
  trustFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 20, padding: 14, borderRadius: 12 },
  trustText: { fontSize: 12, textAlign: 'center', flex: 1 },
});
