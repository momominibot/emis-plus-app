// Storage interface the handlers depend on. db.ts implements it with
// postgres.js; the unit tests use an in-memory fake.

export interface PaidOrderInput {
  webhookId: string | null;
  orderId: string;
  email: string;
  customerId: string | null;
  orderName: string | null;
  amountCents: number;
  presentmentCents?: number | null;
  presentmentCurrency?: string | null;
  taxesIncluded?: boolean;
  processedAt?: string | null;
}

export interface RefundInput {
  webhookId: string | null;
  refundId: string;
  orderId: string;
  lineCents: number;
  lineTaxCents: number;
  txCents: number;
  /** null means the shop currency */
  txCurrency: string | null;
  otherCents: number;
  otherPresentmentCents?: number | null;
  lineTaxPresentmentCents?: number | null;
}

export type ReferralOutcome =
  | 'pending'
  | 'invalid_code'
  | 'self_referral'
  | 'already_claimed'
  | 'not_new_customer'
  | 'mutual_referral';

/** A signed-in Supabase user whose email Supabase Auth has confirmed. */
export interface Member {
  memberId: string;
  email: string;
}

export interface LoyaltyDb {
  recordPaidOrder(input: PaidOrderInput): Promise<Record<string, unknown>>;
  recordRefund(input: RefundInput): Promise<Record<string, unknown>>;
  getMember(member: Member): Promise<Record<string, unknown>>;
  claimReferral(member: Member, code: string): Promise<{ outcome: ReferralOutcome }>;
}
