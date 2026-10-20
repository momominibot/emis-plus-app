// Storage interface the handlers depend on. db.ts implements it with
// postgres.js; the unit tests use an in-memory fake.

export interface PaidOrderInput {
  webhookId: string | null;
  orderId: string;
  customerId: string;
  orderName: string | null;
  amountCents: number;
}

export interface RefundInput {
  webhookId: string | null;
  refundId: string;
  orderId: string;
  amountCents: number;
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
