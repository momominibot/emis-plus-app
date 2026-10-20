import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '@/components/Icon';
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
      Alert.alert('Bonus added', '100 welcome points have been added to your account.');
      loadData();
    } else {
      Alert.alert('Invalid code', 'This referral code is invalid, already used, or is your own code.');
    }
  }

  const menuItems = [
    { icon: 'gift-outline', label: 'My Vouchers', action: () => {} },
    { icon: 'cube-outline', label: 'Order History', action: () => {} },
    { icon: 'card-outline', label: 'Transaction History', action: () => {} },
    { icon: 'call-outline', label: 'Contact Us', action: () => {} },
    { icon: 'settings-outline', label: 'Settings', action: () => {} },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Profile row */}
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.avatarText, { color: colors.primaryDark }]}>
              {profile?.name?.[0]?.toUpperCase() || 'G'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]}>{profile?.name || 'Guest'}</Text>
            <Text style={[styles.email, { color: colors.textSecondary }]}>{profile?.email || 'guest@emis.asia'}</Text>
          </View>
          <View style={[styles.tierBadge, { backgroundColor: tier.color + '20' }]}>
            <Text style={[styles.tierText, { color: tier.color }]}>{tier.name}</Text>
          </View>
        </View>

        {/* Membership card */}
        <View style={[styles.membershipCard, { backgroundColor: colors.primaryDark }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={styles.membershipLabel}>Health Points</Text>
              <Text style={styles.membershipPoints}>{profile?.points ?? 0}</Text>
            </View>
            <View style={[styles.membershipTier, { backgroundColor: tier.color }]}>
              <Text style={styles.membershipTierText}>{tier.name}</Text>
            </View>
          </View>
          {nextTier && (
            <View style={{ marginTop: 16 }}>
              <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.accent }]} />
              </View>
              <Text style={styles.progressText}>
                S${(nextTier.minSpend - (profile?.totalSpent || 0)).toFixed(2)} to {nextTier.name}
              </Text>
            </View>
          )}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>S${(profile?.totalSpent || 0).toFixed(0)}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total spent</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>{profile?.referralCount ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Referrals</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>{transactions.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Transactions</Text>
          </View>
        </View>

        {/* Referral */}
        <View style={[styles.referralCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.referralTitle, { color: colors.text }]}>Your referral code</Text>
          <Text style={[styles.referralCode, { color: colors.primary }]}>{profile?.referralCode || '------'}</Text>
          <Text style={[styles.referralDesc, { color: colors.textSecondary }]}>
            Share with friends - you both get 100 bonus points
          </Text>
          {!referralClaimed && (
            <TouchableOpacity
              style={[styles.referralBtn, { backgroundColor: colors.primaryLight }]}
              onPress={() => setShowReferralInput(!showReferralInput)}
            >
              <Text style={[styles.referralBtnText, { color: colors.primaryDark }]}>
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
                <Text style={{ color: '#fff', fontWeight: '600' }}>Apply & claim bonus</Text>
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
                <Icon name={item.icon as any} size={18} color={colors.primary} />
              </View>
              <Text style={[styles.menuText, { color: colors.text }]}>{item.label}</Text>
              <Icon name="chevron-forward" size={16} color={colors.textTertiary} />
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
  container: { flex: 1 },
  profileRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '700' },
  email: { fontSize: 13, marginTop: 2 },
  tierBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  tierText: { fontSize: 12, fontWeight: '700' },
  membershipCard: { marginHorizontal: 20, borderRadius: 20, padding: 20, shadowColor: '#1B2B2A', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  membershipLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
  membershipPoints: { color: '#fff', fontSize: 34, fontWeight: '700', marginTop: 4 },
  membershipTier: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  membershipTierText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 6 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginTop: 16 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, borderWidth: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 2, textAlign: 'center' },
  referralCard: { margin: 20, borderRadius: 16, padding: 16, borderWidth: 1, alignItems: 'center' },
  referralTitle: { fontSize: 14, fontWeight: '600' },
  referralCode: { fontSize: 26, fontWeight: '800', letterSpacing: 3, marginTop: 4, fontFamily: 'monospace' },
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
