import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Share, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { SIGN_IN_AVAILABLE } from '@/lib/auth/config';
import { signIn, signOut } from '@/lib/auth/session';
import { LOYALTY_AVAILABLE, claimReferral } from '@/lib/loyalty';
import { STORE_URL } from '@/lib/shopify';
import { sessionKey, useMembership } from '@/lib/useMembership';
import { TIER_CONFIG } from '@/lib/types';

export default function AccountScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const router = useRouter();
  const { session, ready, membership, loading, error, reload } = useMembership();
  const [signingIn, setSigningIn] = useState(false);
  const [signInMsg, setSignInMsg] = useState<string | null>(null);
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [claiming, setClaiming] = useState(false);
  // Inline feedback: Alert.alert does nothing in the web build.
  const [referralMsg, setReferralMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // A different account (or signing out) starts the referral form afresh.
  const key = sessionKey(session);
  useEffect(() => {
    setReferralMsg(null);
    setReferralInput('');
    setShowReferralInput(false);
  }, [key]);

  const customer = session?.customer;
  const displayName = customer?.firstName || (session ? 'EMIS+ member' : 'Guest');
  const tier = TIER_CONFIG[membership?.tier ?? 'silver'];
  const totalSpent = (membership?.totalSpentCents ?? 0) / 100;
  const nextTier = membership?.tier === 'silver' ? TIER_CONFIG.gold : membership?.tier === 'gold' ? TIER_CONFIG.diamond : null;
  const progress = nextTier ? Math.min(100, (totalSpent / nextTier.minSpend) * 100) : 100;

  async function handleSignIn() {
    setSigningIn(true);
    setSignInMsg(null);
    const result = await signIn();
    setSigningIn(false);
    if (result && !result.ok) setSignInMsg(result.message);
  }

  async function handleApplyReferral() {
    if (!referralInput.trim() || claiming) return;
    setClaiming(true);
    try {
      const result = await claimReferral(referralInput);
      setReferralMsg({ ok: result.ok, text: result.message });
      if (result.ok) {
        setShowReferralInput(false);
        reload();
      }
    } catch (err) {
      setReferralMsg({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    } finally {
      setClaiming(false);
    }
  }

  async function shareCode() {
    if (!membership?.referralCode) return;
    try {
      await Share.share({
        message: `I shop for wound, ostomy and compression supplies on EMIS+. Use my code ${membership.referralCode} in the EMIS+ app before your first order and we both get 100 Health Points once it is paid.`,
      });
    } catch { /* share sheet closed or unsupported */ }
  }

  const menuItems = [
    { icon: 'cube-outline', label: 'Order History', action: () => router.push('/orders') },
    { icon: 'call-outline', label: 'Contact Us', action: () => {} },
    { icon: 'settings-outline', label: 'Settings', action: () => {} },
    ...(session ? [{ icon: 'log-out-outline', label: 'Sign out', action: () => signOut() }] : []),
  ];

  const referredLine =
    membership?.referredStatus === 'pending'
      ? 'Referral code saved. Your 100 welcome points arrive when your first order is paid.'
      : membership?.referredStatus === 'completed'
        ? 'Welcome bonus received from your referral.'
        : membership?.referredStatus === 'reversed'
          ? 'Your referral bonus was reversed because the first order was refunded.'
          : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Profile row */}
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.avatarText, { color: colors.primaryDark }]}>{displayName[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]}>{displayName}</Text>
            <Text style={[styles.email, { color: colors.textSecondary }]}>
              {customer?.email || (session ? 'Signed in with emis.asia' : 'Not signed in')}
            </Text>
          </View>
          {membership && (
            <View style={[styles.tierBadge, { backgroundColor: tier.color + '20' }]}>
              <Text style={[styles.tierText, { color: tier.color }]}>{tier.name}</Text>
            </View>
          )}
        </View>

        {!ready ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        ) : !SIGN_IN_AVAILABLE ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>EMIS+ accounts are coming soon</Text>
            <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
              Soon you will sign in here with your emis.asia account to see your orders, Health Points and referral code.
              For now, your orders and delivery updates are in your emis.asia account.
            </Text>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => WebBrowser.openBrowserAsync(STORE_URL + '/account')}>
              <Text style={styles.btnText}>Open my emis.asia account</Text>
            </TouchableOpacity>
          </View>
        ) : !session ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Sign in to EMIS+</Text>
            <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
              Use the email address you shop with on emis.asia. You will see your orders and collect Health Points on paid orders.
            </Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary, opacity: signingIn ? 0.6 : 1 }]}
              onPress={handleSignIn}
              disabled={signingIn}
            >
              <Text style={styles.btnText}>{signingIn ? 'Opening sign-in...' : 'Sign in with emis.asia'}</Text>
            </TouchableOpacity>
            {signInMsg && <Text style={[styles.feedback, { color: colors.danger }]}>{signInMsg}</Text>}
          </View>
        ) : !LOYALTY_AVAILABLE ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Health Points launch soon</Text>
            <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
              You are signed in. Your orders are under Order History below.
            </Text>
          </View>
        ) : (
          <>
            {/* Membership card */}
            <View style={[styles.membershipCard, { backgroundColor: colors.primaryDark }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <Text style={styles.membershipLabel}>Health Points</Text>
                  <Text style={styles.membershipPoints}>{membership ? membership.points : loading ? '...' : '-'}</Text>
                </View>
                <View style={[styles.membershipTier, { backgroundColor: tier.color }]}>
                  <Text style={styles.membershipTierText}>{tier.name}</Text>
                </View>
              </View>
              {membership && nextTier && (
                <View style={{ marginTop: 16 }}>
                  <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                    <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.accent }]} />
                  </View>
                  <Text style={styles.progressText}>
                    S${Math.max(nextTier.minSpend - totalSpent, 0).toFixed(2)} to {nextTier.name}
                  </Text>
                </View>
              )}
              <Text style={styles.membershipNote}>Points come from paid orders. Refunded items take their points back.</Text>
            </View>
            {error && (
              <TouchableOpacity onPress={reload}>
                <Text style={[styles.feedback, { color: colors.danger, marginHorizontal: 20 }]}>{error} Tap to retry.</Text>
              </TouchableOpacity>
            )}

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>S${totalSpent.toFixed(0)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Tier spend</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>{membership?.referralsCompleted ?? 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Friends referred</Text>
              </View>
            </View>

            {/* Referral */}
            {membership && (
              <View style={[styles.referralCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.referralTitle, { color: colors.text }]}>Your referral code</Text>
                <Text style={[styles.referralCode, { color: colors.primary }]}>{membership.referralCode}</Text>
                <Text style={[styles.referralDesc, { color: colors.textSecondary }]}>
                  A friend enters it in the EMIS+ app before their first order. When that order is paid, you both get 100 Health Points.
                </Text>
                {membership.referralsPending > 0 && (
                  <Text style={[styles.referralDesc, { color: colors.textTertiary }]}>
                    {membership.referralsPending} friend{membership.referralsPending === 1 ? '' : 's'} waiting on a first order.
                  </Text>
                )}
                <TouchableOpacity style={[styles.referralBtn, { backgroundColor: colors.primary }]} onPress={shareCode}>
                  <Text style={[styles.referralBtnText, { color: '#fff' }]}>Share my code</Text>
                </TouchableOpacity>
                {referralMsg && (
                  <Text style={[styles.feedback, { textAlign: 'center', color: referralMsg.ok ? colors.success : colors.danger }]}>
                    {referralMsg.text}
                  </Text>
                )}
                {referredLine ? (
                  <Text style={[styles.referralDesc, { color: colors.textSecondary, marginTop: 10 }]}>{referredLine}</Text>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.referralBtn, { backgroundColor: colors.primaryLight }]}
                      onPress={() => setShowReferralInput(!showReferralInput)}
                    >
                      <Text style={[styles.referralBtnText, { color: colors.primaryDark }]}>
                        {showReferralInput ? 'Cancel' : 'Have a referral code?'}
                      </Text>
                    </TouchableOpacity>
                    {showReferralInput && (
                      <View style={{ marginTop: 12, gap: 8, width: '100%' }}>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                          placeholder="Enter code"
                          placeholderTextColor={colors.textTertiary}
                          value={referralInput}
                          onChangeText={setReferralInput}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          maxLength={12}
                        />
                        <TouchableOpacity
                          style={[styles.btn, { backgroundColor: colors.primary, opacity: claiming ? 0.6 : 1 }]}
                          onPress={handleApplyReferral}
                          disabled={claiming}
                        >
                          <Text style={styles.btnText}>{claiming ? 'Checking...' : 'Use this code'}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </>
        )}

        {/* Menu */}
        <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {menuItems.map((item, i) => (
            <TouchableOpacity
              key={item.label}
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
        {membership && membership.transactions.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent activity</Text>
            <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {membership.transactions.slice(0, 10).map(tx => (
                <View key={tx.id} style={styles.txRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txDesc, { color: colors.text }]}>{tx.description}</Text>
                    <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                      {new Date(tx.date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <Text style={[styles.txAmount, { color: tx.points > 0 ? colors.success : colors.danger }]}>
                    {tx.points > 0 ? '+' : ''}{tx.points}
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
  infoCard: { marginHorizontal: 20, marginBottom: 20, borderRadius: 16, borderWidth: 1, padding: 18, gap: 10 },
  infoTitle: { fontSize: 18, fontWeight: '700' },
  infoBody: { fontSize: 15, lineHeight: 22 },
  feedback: { marginTop: 10, fontSize: 14, fontWeight: '600' },
  membershipCard: { marginHorizontal: 20, borderRadius: 20, padding: 20, shadowColor: '#1B2B2A', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  membershipLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
  membershipPoints: { color: '#fff', fontSize: 34, fontWeight: '700', marginTop: 4 },
  membershipTier: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  membershipTierText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  membershipNote: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 12 },
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
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
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
