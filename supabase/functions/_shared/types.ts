// Storage interface the handlers depend on. db.ts implements it with
// postgres.js; the unit tests use an in-memory fake.

export interface PaidOrderInput {
  webhookId: string | null;
  orderId: string;
  customerId: string;
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

export interface LoyaltyDb {
  recordPaidOrder(input: PaidOrderInput): Promise<Record<string, unknown>>;
  recordRefund(input: RefundInput): Promise<Record<string, unknown>>;
  getMember(customerId: string): Promise<Record<string, unknown>>;
  claimReferral(customerId: string, code: string, hasShopifyOrders: boolean): Promise<{ outcome: ReferralOutcome }>;
}
