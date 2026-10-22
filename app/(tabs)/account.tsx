import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Share, Image, Linking } from 'react-native';
import { TabHeader, ui } from '@/components/ui';
import { TAB_BAR_SPACE } from '@/components/FloatingTabBar';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { getProfile, getPointsTransactions, addVoucher, generateReferralCode, saveProfile, applyReferral } from '@/lib/loyalty';
import { MemberProfile, PointsTransaction, TIER_CONFIG } from '@/lib/types';

export default function AccountScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [transactions, setTransactions] = useState<PointsTransaction[]>([]);
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [referralClaimed, setReferralClaimed] = useState(false);
  // Inline feedback: Alert.alert does nothing in the web build.
  const [referralMsg, setReferralMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const p = await getProfile();
    if (!p.referralCode) {
      p.referralCode = generateReferralCode(p.name || 'USER');
      await saveProfile(p);
    }
    setProfile(p);
    const txs = await getPointsTransactions();
    setTransactions(txs);
  }

  const tier = profile ? TIER_CONFIG[profile.tier] : TIER_CONFIG.silver;
  const nextTier = profile?.tier === 'silver' ? TIER_CONFIG.gold : profile?.tier === 'gold' ? TIER_CONFIG.diamond : null;
  const progress = nextTier ? Math.min(100, ((profile?.totalSpent || 0) / nextTier.minSpend) * 100) : 100;

  async function handleApplyReferral() {
    if (!referralInput.trim()) return;
    const result = await applyReferral(referralInput);
    if (result) {
      setReferralClaimed(true);
      setShowReferralInput(false);
      setReferralMsg({ ok: true, text: '100 welcome points have been added to your account.' });
      loadData();
    } else {
      setReferralMsg({ ok: false, text: 'This referral code is invalid, already used, or is your own code.' });
    }
  }

  async function shareCode() {
    if (!profile?.referralCode) return;
    try {
      await Share.share({ message: `Join me on EMIS+ for wound, ostomy and compression supplies. Use my code ${profile.referralCode} and we both get 100 Health Points.` });
    } catch { /* share sheet closed or unsupported */ }
  }

  const menuItems = [
    { icon: 'cube-outline', label: 'Order history', action: () => router.push('/orders') },
    { icon: 'storefront-outline', label: 'My emis.asia account', action: () => Linking.openURL('https://www.emis.asia/account') },
    { icon: 'mail-outline', label: 'Contact us: hello@emis.asia', action: () => Linking.openURL('mailto:hello@emis.asia') },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE }}>
        <TabHeader title={profile?.name && profile.name !== 'Guest' ? profile.name : 'My account'}
          subtitle={profile?.email || 'Sign-in coming soon'}
          right={
            <View style={[styles.tierBadge, { backgroundColor: colors.surfaceSunken }]}>
              <Text style={[styles.tierText, { color: colors[profile?.tier || 'silver'] }]}>{tier.name}</Text>
            </View>
          } />

        {/* Preview notice first, so the status is clear before any reward controls */}
        <View style={[styles.preview, { backgroundColor: colors.infoBg }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.info} />
          <Text style={[styles.previewText, { color: colors.text }]}>
            Health Points are in preview. Points and referrals are saved on this device until EMIS+ sign-in launches.
          </Text>
        </View>

        {/* Health Points */}
        <View style={[styles.pointsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pointsLabel, { color: colors.textSecondary }]}>Health Points</Text>
              <Text style={[styles.pointsValue, { color: colors.primary }]}>{profile?.points ?? 0}</Text>
            </View>
            <Image source={require('@/assets/images/art/banner-rewards.webp')} style={styles.pointsArt} resizeMode="contain" />
          </View>
          {nextTier && (
            <View style={{ marginTop: 12 }}>
              <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSunken }]}>
                <View style={[styles.progressFill, { width: `${Math.max(progress, 2)}%`, backgroundColor: colors.primary }]} />
              </View>
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                S${(nextTier.minSpend - (profile?.totalSpent || 0)).toFixed(2)} more to reach {nextTier.name}
              </Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { v: `S$${(profile?.totalSpent || 0).toFixed(0)}`, l: 'Total spent' },
            { v: String(profile?.referralCount ?? 0), l: 'Referrals' },
            { v: String(transactions.length), l: 'Activity' },
          ].map((st, i) => (
            <View key={st.l} style={[styles.stat, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.text }]}>{st.v}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{st.l}</Text>
            </View>
          ))}
        </View>

        {/* Referral */}
        <View style={[styles.referralCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.referralTitle, { color: colors.text }]}>Your referral code</Text>
          <View style={[styles.codeBox, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.referralCode, { color: colors.primaryInk }]}>{profile?.referralCode || '------'}</Text>
          </View>
          <Text style={[styles.referralDesc, { color: colors.textSecondary }]}>
            Share it with a friend. You both get 100 bonus points.
          </Text>
          <TouchableOpacity style={[styles.referralBtn, { backgroundColor: colors.primary }]} onPress={shareCode}>
            <Text style={[styles.referralBtnText, { color: colors.onPrimary }]}>Share my code</Text>
          </TouchableOpacity>
          {referralMsg && (
            <Text style={{ marginTop: 10, fontSize: 14, fontWeight: '600', textAlign: 'center', color: referralMsg.ok ? colors.success : colors.danger }}>
              {referralMsg.text}
            </Text>
          )}
          {!referralClaimed && (
            <TouchableOpacity
              style={[styles.referralBtn, { backgroundColor: colors.primaryLight }]}
              onPress={() => setShowReferralInput(!showReferralInput)}
            >
              <Text style={[styles.referralBtnText, { color: colors.primaryInk }]}>
                {showReferralInput ? 'Cancel' : 'Have a referral code?'}
              </Text>
            </TouchableOpacity>
          )}
          {showReferralInput && !referralClaimed && (
            <View style={{ marginTop: 12, gap: 8 }}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="Enter code"
                placeholderTextColor={colors.textTertiary}
                value={referralInput}
                onChangeText={setReferralInput}
                autoCapitalize="characters"
              />
              <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleApplyReferral}>
                <Text style={{ color: colors.onPrimary, fontWeight: '600' }}>Apply & claim bonus</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Menu */}
        <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {menuItems.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.menuItem, i < menuItems.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}
              onPress={item.action}
            >
              <View style={[styles.menuIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={item.icon as any} size={18} color={colors.primary} />
              </View>
              <Text style={[styles.menuText, { color: colors.text }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Points history */}
        {transactions.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent activity</Text>
            <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {transactions.slice(0, 5).map(tx => (
                <View key={tx.id} style={styles.txRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txDesc, { color: colors.text }]}>{tx.description}</Text>
                    <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                      {new Date(tx.date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <Text style={[styles.txAmount, { color: tx.amount > 0 ? colors.success : colors.danger }]}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginHorizontal: 20, padding: 14, borderRadius: 14 },
  previewText: { flex: 1, fontSize: 14, lineHeight: 20 },
  pointsCard: { marginHorizontal: 20, marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 18 },
  pointsLabel: { fontSize: 14, fontWeight: '600' },
  pointsValue: { fontSize: 38, fontWeight: '800', marginTop: 2, letterSpacing: -0.5 },
  pointsArt: { width: 60, height: 60 },
  progressText: { fontSize: 13, marginTop: 6 },
  statsCard: { flexDirection: 'row', marginHorizontal: 20, marginTop: 12, borderRadius: 18, borderWidth: 1 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  codeBox: { marginTop: 8, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 10, alignSelf: 'stretch', alignItems: 'center' },
  container: { flex: 1 },
  profileRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '700' },
  email: { fontSize: 13, marginTop: 2 },
  tierBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  tierText: { fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 2, textAlign: 'center' },
  referralCard: { margin: 20, borderRadius: 16, padding: 16, borderWidth: 1, alignItems: 'center' },
  referralTitle: { fontSize: 14, fontWeight: '600' },
  referralCode: { fontSize: 24, fontWeight: '800', letterSpacing: 3 },
  referralDesc: { fontSize: 12, marginTop: 6, textAlign: 'center' },
  referralBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  referralBtnText: { fontSize: 14, fontWeight: '600' },
  input: { padding: 12, borderRadius: 10, borderWidth: 1, fontSize: 15, width: '100%' },
  btn: { padding: 12, borderRadius: 10, alignItems: 'center', width: '100%' },
  menu: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, minHeight: 56 },
  menuIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  menuText: { flex: 1, fontSize: 15, fontWeight: '500' },
  sectionTitle: { fontSize: 18, fontWeight: '700', paddingHorizontal: 20, marginTop: 20, marginBottom: 10 },
  historyCard: { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, padding: 4 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  txDesc: { fontSize: 14, fontWeight: '500' },
  txDate: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 16, fontWeight: '700' },
});
