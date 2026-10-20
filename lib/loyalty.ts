import AsyncStorage from '@react-native-async-storage/async-storage';
import { MemberProfile, MemberTier, PointsTransaction, TIER_CONFIG } from './types';

const PROFILE_KEY = '@emis_profile';
const POINTS_KEY = '@emis_points_tx';
const VOUCHERS_KEY = '@emis_vouchers';
const REFERRAL_CLAIMED_KEY = '@emis_referral_claimed';

const DEFAULT_PROFILE: MemberProfile = {
  name: 'Guest',
  email: '',
  tier: 'silver',
  points: 0,
  totalSpent: 0,
  referralCode: '',
  referralCount: 0,
  joinedAt: new Date().toISOString(),
};

// In-memory mutex to prevent concurrent read-modify-write on points
let pointsLock: Promise<void> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const waitFor = pointsLock;
  let release: () => void;
  pointsLock = new Promise<void>(resolve => { release = resolve; });
  try {
    await waitFor;
    return await fn();
  } finally {
    release!();
  }
}

function isValidAmount(amount: number): boolean {
  return Number.isFinite(amount) && Number.isSafeInteger(amount) && amount > 0;
}

export async function getProfile(): Promise<MemberProfile> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw);
    return { ...DEFAULT_PROFILE };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveProfile(profile: MemberProfile) {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function calculateTier(totalSpent: number): MemberTier {
  if (totalSpent >= TIER_CONFIG.diamond.minSpend) return 'diamond';
  if (totalSpent >= TIER_CONFIG.gold.minSpend) return 'gold';
  return 'silver';
}

export async function addPoints(amount: number, description: string, type: PointsTransaction['type'] = 'earn'): Promise<number> {
  if (!isValidAmount(amount)) return 0;
  return withLock(async () => {
    const profile = await getProfile();
    const multiplier = TIER_CONFIG[profile.tier].pointsMultiplier;
    const earned = Math.round(amount * multiplier);
    profile.points += earned;
    profile.tier = calculateTier(profile.totalSpent);
    await saveProfile(profile);

    const tx: PointsTransaction = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      type,
      amount: earned,
      description,
      balanceAfter: profile.points,
    };
    const txs = await getPointsTransactions();
    txs.unshift(tx);
    await AsyncStorage.setItem(POINTS_KEY, JSON.stringify(txs.slice(0, 500)));
    return earned;
  });
}

export async function redeemPoints(amount: number, description: string): Promise<void> {
  if (!isValidAmount(amount)) throw new Error('Invalid redemption amount');
  return withLock(async () => {
    const profile = await getProfile();
    if (profile.points < amount) throw new Error('Insufficient points');
    profile.points -= amount;
    await saveProfile(profile);

    const tx: PointsTransaction = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      type: 'burn',
      amount: -amount,
      description,
      balanceAfter: profile.points,
    };
    const txs = await getPointsTransactions();
    txs.unshift(tx);
    await AsyncStorage.setItem(POINTS_KEY, JSON.stringify(txs.slice(0, 500)));
  });
}

export async function getPointsTransactions(): Promise<PointsTransaction[]> {
  try {
    const raw = await AsyncStorage.getItem(POINTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function generateReferralCode(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'EMIS';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}${suffix}`;
}

export async function applyReferral(code: string): Promise<string | null> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed || trimmed.length < 4) return null;

  const alreadyClaimed = await AsyncStorage.getItem(REFERRAL_CLAIMED_KEY);
  if (alreadyClaimed) return null;

  const profile = await getProfile();
  if (!profile.referralCode) {
    profile.referralCode = generateReferralCode(profile.name || 'USER');
    await saveProfile(profile);
  }
  // Prevent self-referral
  if (trimmed === profile.referralCode) return null;

  await addPoints(100, `Welcome bonus from referral`, 'bonus');
  await AsyncStorage.setItem(REFERRAL_CLAIMED_KEY, trimmed);
  return profile.referralCode;
}

export async function getVouchers() {
  try {
    const raw = await AsyncStorage.getItem(VOUCHERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addVoucher(voucher: { code: string; title: string; discount: string; expiresAt?: string }) {
  const vouchers = await getVouchers();
  if (vouchers.some((v: any) => v.code === voucher.code)) return;
  vouchers.unshift({ ...voucher, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, used: false });
  await AsyncStorage.setItem(VOUCHERS_KEY, JSON.stringify(vouchers));
}
