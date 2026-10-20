// Core domain types for EMIS+ app

export interface Product {
  id: string;
  title: string;
  description: string;
  price: string;
  compareAtPrice?: string;
  image?: string;
  handle: string;
  tags: string[];
  vendor: string;
  /** False when every variant is sold out. */
  available?: boolean;
  /** Product page on emis.asia, where checkout happens. */
  url?: string;
}

export interface Collection {
  id: string;
  title: string;
  handle: string;
  image?: string;
  productCount?: number;
}

export type MemberTier = 'silver' | 'gold' | 'diamond';

/** One Health Points ledger entry from the loyalty service. */
export interface LedgerEntry {
  id: string;
  date: string;
  kind: 'order' | 'refund' | 'referral_welcome' | 'referral_reward' | 'referral_reversal';
  points: number;
  balanceAfter: number;
  description: string;
}

/** The signed-in customer's membership, as returned by GET /loyalty/me. */
export interface Membership {
  customerId: string;
  points: number;
  tier: MemberTier;
  totalSpentCents: number;
  referralCode: string;
  referralsCompleted: number;
  referralsPending: number;
  referredStatus: 'pending' | 'completed' | 'reversed' | null;
  transactions: LedgerEntry[];
}

export interface TierPerk {
  tier: MemberTier;
  name: string;
  minSpend: number;
  pointsMultiplier: number;
  perks: string[];
  color: string;
}

export const TIER_CONFIG: Record<MemberTier, TierPerk> = {
  silver: {
    tier: 'silver',
    name: 'Silver',
    minSpend: 0,
    pointsMultiplier: 1,
    perks: ['1 point per $1 spent', 'Birthday voucher', 'Access to health tools'],
    color: '#94a3b8',
  },
  gold: {
    tier: 'gold',
    name: 'Gold',
    minSpend: 500,
    pointsMultiplier: 1.5,
    perks: ['1.5 points per $1 spent', 'Free shipping on orders > $50', 'Exclusive promotions', 'Priority support'],
    color: '#f59e0b',
  },
  diamond: {
    tier: 'diamond',
    name: 'Diamond',
    minSpend: 2000,
    pointsMultiplier: 2,
    perks: ['2 points per $1 spent', 'Free shipping all orders', 'Early access to new products', 'Dedicated support', 'Free gift with every order'],
    color: '#06b6d4',
  },
};

// Medical tool types (all local, never uploaded)
// Field names match SQLite columns (snake_case)
export interface WoundRecord {
  id: number;
  date: string;
  location: string;
  length: number;
  width: number;
  depth: number;
  exudate: 'none' | 'light' | 'moderate' | 'heavy';
  tissue_type: string;
  notes: string;
  photo_uri?: string;
}

export interface OstomyRecord {
  id: number;
  date: string;
  output_type: string;
  output_amount: number;
  appliance_change: number;
  skin_condition: string;
  notes: string;
}

export interface IntakeOutputRecord {
  id: number;
  date: string;
  time: string;
  type: 'intake' | 'output';
  category: string;
  amount: number;
  notes: string;
}

export interface VitalsRecord {
  id: number;
  date: string;
  time: string;
  systolic?: number;
  diastolic?: number;
  heart_rate?: number;
  temperature?: number;
  oxygen_saturation?: number;
  blood_sugar?: number;
  weight?: number;
  notes: string;
}

export interface CompressionMeasurement {
  id: number;
  date: string;
  leg: 'left' | 'right';
  ankle: number;
  calf: number;
  thigh: number;
  length: number;
  recommended_size?: string;
}
