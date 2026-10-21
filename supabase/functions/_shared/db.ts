// LoyaltyDb over a direct Postgres connection (SUPABASE_DB_URL in the edge
// runtime). Every call is one statement running one loyalty.* function, so
// each award, refund or claim is a single transaction. prepare:false keeps
// it compatible with Supabase's transaction-mode pooler.

import postgres from 'npm:postgres@3.4.9';
import type { LoyaltyDb, ReferralOutcome } from './types.ts';

export type LoyaltyDbConnection = LoyaltyDb & { end(): Promise<void> };

export function createLoyaltyDb(url: string, options: { max?: number } = {}): LoyaltyDbConnection {
  const sql = postgres(url, {
    prepare: false,
    max: options.max ?? 3,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });

  return {
    async recordPaidOrder(o) {
      const [row] = await sql`
        select loyalty.record_paid_order(${o.webhookId}, ${o.orderId}::bigint, ${o.email}, ${o.customerId}::bigint,
                                         ${o.orderName}, ${o.amountCents}::bigint,
                                         ${o.presentmentCents ?? null}::bigint, ${o.presentmentCurrency ?? null},
                                         ${o.taxesIncluded ?? true}, ${o.processedAt ?? null}::timestamptz) as r`;
      return row.r;
    },
    async recordRefund(r) {
      const [row] = await sql`
        select loyalty.record_refund(${r.webhookId}, ${r.refundId}::bigint, ${r.orderId}::bigint,
                                     ${r.lineCents}::bigint, ${r.lineTaxCents}::bigint, ${r.txCents}::bigint,
                                     ${r.txCurrency}, ${r.otherCents}::bigint,
                                     ${r.otherPresentmentCents ?? null}::bigint, ${r.lineTaxPresentmentCents ?? null}::bigint) as r`;
      return row.r;
    },
    async getMember(m) {
      const [row] = await sql`select loyalty.get_member(${m.memberId}::uuid, ${m.email}) as r`;
      return row.r;
    },
    async claimReferral(m, code) {
      const [row] = await sql`select loyalty.claim_referral(${m.memberId}::uuid, ${m.email}, ${code}) as r`;
      return row.r as { outcome: ReferralOutcome };
    },
    end: () => sql.end({ timeout: 5 }),
  };
}
