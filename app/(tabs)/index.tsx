import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, useWindowDimensions } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { brand } from '@/constants/Colors';
import { useColors, TabHeader, SectionHeader, ui } from '@/components/ui';
import { Drift, Rise } from '@/components/Motion';
import { TAB_BAR_SPACE } from '@/components/FloatingTabBar';
import { getProfile, getVouchers } from '@/lib/loyalty';
import { getNewProducts } from '@/lib/shopify';
import { MemberProfile, Product, Voucher, TIER_CONFIG } from '@/lib/types';

const ART = {
  hero: require('@/assets/images/art/hero-home.webp'),
  assistant: require('@/assets/images/art/banner-assistant.webp'),
  learn: require('@/assets/images/art/banner-learn.webp'),
  rewards: require('@/assets/images/art/banner-rewards.webp'),
};

const SHOP_BY_NEED = [
  { id: 'wound', label: 'Wound care', caption: 'Dressings and bandages', art: require('@/assets/images/art/tile-wound.webp'), handle: 'wound-care-supplies-singapore' },
  { id: 'ostomy', label: 'Ostomy', caption: 'Pouches and barriers', art: require('@/assets/images/art/tile-ostomy.webp'), handle: 'ostomy-products' },
  { id: 'compression', label: 'Compression', caption: 'Stockings and sizing', art: require('@/assets/images/art/tile-compression.webp'), handle: 'compression-stocking' },
  { id: 'hygiene', label: 'Hygiene', caption: 'Gloves, masks, sanitiser', art: require('@/assets/images/art/tile-hygiene.webp'), handle: 'hygiene-and-infection-control' },
];

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 640;
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [newProducts, setNewProducts] = useState<Product[]>([]);

  useFocusEffect(useCallback(() => {
    getProfile().then(setProfile);
    getVouchers().then(setVouchers);
  }, []));

  useEffect(() => {
    getNewProducts(8).then(setNewProducts).catch(() => { /* offline */ });
  }, []);

  const tier = profile ? TIER_CONFIG[profile.tier] : TIER_CONFIG.silver;
  const nextTier = profile?.tier === 'silver' ? TIER_CONFIG.gold : profile?.tier === 'gold' ? TIER_CONFIG.diamond : null;
  const progress = nextTier ? Math.min(100, ((profile?.totalSpent || 0) / nextTier.minSpend) * 100) : 100;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = profile?.name && profile.name !== 'Guest' ? profile.name : '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE }}>
        <TabHeader
          title={`${greeting}${name ? ', ' + name : ''}`}
          subtitle={new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })}
          right={
            <TouchableOpacity onPress={() => router.push('/account')} style={[styles.avatar, { backgroundColor: colors.primaryLight }]} accessibilityLabel="Account">
              <Text style={[styles.avatarText, { color: colors.primaryInk }]}>{(name || 'G')[0].toUpperCase()}</Text>
            </TouchableOpacity>
          }
        />

        {/* Search */}
        <TouchableOpacity
          style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }, ui.cardShadow]}
          onPress={() => router.push({ pathname: '/shop', params: { focus: String(Date.now()) } })}
          accessibilityRole="search"
        >
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <Text style={[styles.searchPlaceholder, { color: colors.textTertiary }]}>Search dressings, pouches, stockings...</Text>
        </TouchableOpacity>

        {/* Hero */}
        <Rise style={styles.heroWrap}>
          <View style={[styles.hero, { backgroundColor: colors.primaryLight }]}>
            <View style={styles.heroText}>
              <Text style={[styles.heroEyebrow, { color: colors.primary }]}>SINGAPORE MEDICAL SUPPLIES</Text>
              <Text style={[styles.heroTitle, { color: colors.primaryInk }]}>Wound, ostomy and compression care, in one place</Text>
              <Text style={[styles.heroBody, { color: colors.textSecondary }]}>
                Products, guides and tools to help you choose well.
              </Text>
              <View style={styles.heroActions}>
                <TouchableOpacity style={[styles.heroBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/shop')}>
                  <Text style={[styles.heroBtnText, { color: colors.onPrimary }]}>Shop now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.heroBtnGhost, { backgroundColor: colors.surface }]} onPress={() => router.push('/tools/wound-advisor')}>
                  <Text style={[styles.heroBtnGhostText, { color: colors.primaryInk }]}>Find a dressing</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={[styles.heroArtWrap, wide && { width: 220, height: 220 }]} pointerEvents="none">
              <Drift amplitude={0} duration={7000} tilt={0} scale={0.05} style={styles.heroStage}>
                <View style={[styles.heroStageCircle, { backgroundColor: colors.primary, opacity: 0.1 }]} />
              </Drift>
              <Drift amplitude={5} duration={5600} tilt={0.8} scale={0.02}>
                <Image source={ART.hero} style={[styles.heroArt, wide && { width: 220, height: 220 }]} resizeMode="contain" />
              </Drift>
            </View>
          </View>
        </Rise>

        {/* Shop by need */}
        <SectionHeader title="Shop by need" actionLabel="All products" onAction={() => router.push('/shop')} />
        <View style={styles.needGrid}>
          {SHOP_BY_NEED.map((need, i) => (
            <Rise key={need.id} delay={80 + i * 70} style={styles.needTileWrap}>
              <TouchableOpacity
                style={[styles.needTile, { backgroundColor: colors.surface, borderColor: colors.border }, ui.cardShadow]}
                onPress={() => router.push({ pathname: '/shop', params: { category: need.handle } })}
                accessibilityLabel={`Shop ${need.label}`}
              >
                <Image source={need.art} style={styles.needArt} resizeMode="contain" />
                <Text style={[styles.needLabel, { color: colors.text }]}>{need.label}</Text>
                <Text style={[styles.needCaption, { color: colors.textSecondary }]}>{need.caption}</Text>
              </TouchableOpacity>
            </Rise>
          ))}
        </View>

        {/* Assistant */}
        <Rise delay={300} style={ui.gutter}>
          <TouchableOpacity style={[styles.featureCard, { backgroundColor: colors.primaryLight }]} onPress={() => router.push('/ai-assistant')}>
            <Drift amplitude={3} duration={4800} tilt={2} scale={0.02}>
              <Image source={ART.assistant} style={styles.featureArt} resizeMode="contain" />
            </Drift>
            <View style={{ flex: 1 }}>
              <Text style={[styles.featureTitle, { color: colors.primaryInk }]}>Not sure what to choose?</Text>
              <Text style={[styles.featureBody, { color: colors.textSecondary }]}>Ask our product assistant. Product help only, not medical advice.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
        </Rise>

        {/* Learn */}
        <Rise delay={360} style={[ui.gutter, { marginTop: 12 }]}>
          <TouchableOpacity style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }, ui.cardShadow]} onPress={() => router.push('/learn')}>
            <Image source={ART.learn} style={styles.featureArt} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.featureTitle, { color: colors.text }]}>Learn</Text>
              <Text style={[styles.featureBody, { color: colors.textSecondary }]}>Short reels and plain-language guides on wound healing, stoma care and nutrition.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </Rise>

        {/* Rewards */}
        <Rise delay={420} style={[ui.gutter, { marginTop: 12 }]}>
          <TouchableOpacity style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }, ui.cardShadow]} onPress={() => router.push('/account')}>
            <Image source={ART.rewards} style={styles.featureArt} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={[styles.pointsValue, { color: colors.text }]}>{profile?.points ?? 0}</Text>
                <Text style={[styles.pointsLabel, { color: colors.textSecondary }]}>Health Points</Text>
                <View style={[styles.tierBadge, { backgroundColor: colors.surfaceSunken }]}>
                  <Text style={[styles.tierText, { color: colors[profile?.tier || 'silver'] }]}>{tier.name}</Text>
                </View>
              </View>
              {nextTier && (
                <View style={{ marginTop: 8 }}>
                  <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSunken }]}>
                    <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.accent }]} />
                  </View>
                  <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                    S${(nextTier.minSpend - (profile?.totalSpent || 0)).toFixed(2)} to {nextTier.name}
                  </Text>
                </View>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </Rise>

        {/* Vouchers */}
        {vouchers.length > 0 && (
          <>
            <SectionHeader title="Your vouchers" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.hScrollContent}>
              {vouchers.map(v => (
                <View key={v.id} style={[styles.voucherCard, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
                  <Text style={[styles.voucherDiscount, { color: colors.accent }]}>{v.discount}</Text>
                  <Text style={[styles.voucherTitle, { color: colors.text }]}>{v.title}</Text>
                  <Text style={[styles.voucherCode, { color: colors.textSecondary }]}>{v.code}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* New arrivals */}
        <SectionHeader title="New arrivals" subtitle="Latest products on emis.asia" actionLabel="See all" onAction={() => router.push('/shop')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.hScrollContent}>
          {newProducts.length === 0 ? (
            [0, 1, 2].map(i => <View key={i} style={[styles.productCard, { backgroundColor: colors.surfaceSunken, borderColor: colors.border, height: 212 }]} />)
          ) : newProducts.map(p => (
            <Link key={p.id} href={`/product/${p.handle}`} asChild>
              <TouchableOpacity style={StyleSheet.flatten([styles.productCard, { backgroundColor: colors.surface, borderColor: colors.border }, ui.cardShadow])}>
                {p.image ? (
                  <Image source={{ uri: p.image }} style={styles.productImage} resizeMode="contain" />
                ) : (
                  <View style={[styles.productImage, { backgroundColor: colors.surfaceSunken }]} />
                )}
                <Text style={[styles.productVendor, { color: colors.textTertiary }]} numberOfLines={1}>{p.vendor?.toUpperCase()}</Text>
                <Text style={[styles.productName, { color: colors.text }]} numberOfLines={2}>{p.title}</Text>
                <Text style={[styles.productPrice, { color: colors.text }]}>S${p.price}</Text>
              </TouchableOpacity>
            </Link>
          ))}
        </ScrollView>

        {/* Trust */}
        <View style={[styles.trust, { backgroundColor: colors.surfaceSunken }]}>
          <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
          <Text style={[styles.trustText, { color: colors.textSecondary }]}>Authorised distributor. Singapore-based. GST-inclusive pricing.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '800' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, paddingHorizontal: 16, height: 50, borderRadius: 14, borderWidth: 1, gap: 10 },
  searchPlaceholder: { fontSize: 15, flex: 1 },
  heroWrap: { paddingHorizontal: 20, marginTop: 16 },
  hero: { flexDirection: 'row', alignItems: 'center', borderRadius: 24, padding: 16, paddingRight: 4, gap: 2, overflow: 'hidden' },
  heroText: { flex: 1, justifyContent: 'center', gap: 6 },
  heroEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  heroTitle: { fontSize: 19, lineHeight: 25, fontWeight: '800', letterSpacing: -0.3 },
  heroBody: { fontSize: 13, lineHeight: 18 },
  heroActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  heroBtn: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 12 },
  heroBtnText: { fontWeight: '700', fontSize: 14 },
  heroBtnGhost: { paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderRadius: 12 },
  heroBtnGhostText: { fontWeight: '700', fontSize: 14 },
  heroArtWrap: { width: 120, height: 140, alignItems: 'center', justifyContent: 'center' },
  heroStage: { position: 'absolute', top: 14, left: 4, right: 4, bottom: 14, alignItems: 'center', justifyContent: 'center' },
  heroStageCircle: { width: 112, height: 112, borderRadius: 56 },
  heroArt: { width: 132, height: 132 },
  needGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 12 },
  needTileWrap: { flexBasis: '47%', flexGrow: 1 },
  needTile: { minHeight: 132, borderRadius: 18, borderWidth: 1, padding: 14, justifyContent: 'flex-end', overflow: 'hidden' },
  needLabel: { fontSize: 16, fontWeight: '800' },
  needCaption: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  needArt: { position: 'absolute', top: 8, right: 8, width: 64, height: 64 },
  featureCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, gap: 12 },
  featureArt: { width: 64, height: 64 },
  featureTitle: { fontSize: 16, fontWeight: '800' },
  featureBody: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  pointsValue: { fontSize: 26, fontWeight: '800' },
  pointsLabel: { fontSize: 14, fontWeight: '600' },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  tierText: { fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 12, marginTop: 4 },
  hScroll: { flexGrow: 0, flexShrink: 0 },
  hScrollContent: { paddingHorizontal: 20, gap: 12, paddingVertical: 4 },
  voucherCard: { width: 180, borderRadius: 14, padding: 14, borderWidth: 1, borderStyle: 'dashed' },
  voucherDiscount: { fontSize: 22, fontWeight: '800' },
  voucherTitle: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  voucherCode: { fontSize: 11, marginTop: 6, fontFamily: 'monospace' },
  productCard: { width: 156, borderRadius: 16, borderWidth: 1, padding: 10 },
  productImage: { width: '100%', height: 110, borderRadius: 10, backgroundColor: '#fff' },
  productVendor: { fontSize: 10, fontWeight: '700', marginTop: 8, letterSpacing: 0.4 },
  productName: { fontSize: 13, fontWeight: '600', lineHeight: 17, minHeight: 34, marginTop: 2 },
  productPrice: { fontSize: 15, fontWeight: '800', marginTop: 6 },
  trust: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 20, padding: 14, borderRadius: 14 },
  trustText: { fontSize: 12, textAlign: 'center', flex: 1 },
});
