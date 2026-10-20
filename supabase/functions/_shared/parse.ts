// Parsing helpers for Shopify webhook payloads.
//
// Shopify IDs can exceed Number.MAX_SAFE_INTEGER (the sample payloads use
// 820982911946154508), so IDs are never read through a lossy JSON number:
// parseJsonLossless keeps unsafe integers as their source text, and idFrom
// accepts only exact decimal strings, safe integers or matching GIDs.
// Money is parsed from Shopify's decimal strings straight to integer cents.

type ReviverContext = { source?: string };

export function parseJsonLossless(text: string): unknown {
  return JSON.parse(text, (_key: string, value: unknown, context?: ReviverContext) => {
    if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
      const source = context?.source;
      if (source && /^-?\d+$/.test(source)) return source;
      throw new Error('Unsafe integer in payload and no source text to recover it');
    }
    return value;
  });
}

const DIGITS = /^[1-9]\d{0,18}$/;
const INT64_MAX = 9223372036854775807n;

/** Decimal ID string from a number, digit string or gid://shopify/<type>/<id>. */
export function idFrom(value: unknown, gidType?: string): string {
  let text: string | null = null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    text = String(value);
  } else if (typeof value === 'string') {
    if (DIGITS.test(value)) {
      text = value;
    } else if (gidType) {
      const m = /^gid:\/\/shopify\/([A-Za-z]+)\/(\d+)(?:\?.*)?$/.exec(value);
      if (m && m[1] === gidType && DIGITS.test(m[2])) text = m[2];
    }
  }
  if (!text || BigInt(text) > INT64_MAX) {
    throw new Error('Invalid ' + (gidType || 'Shopify') + ' id');
  }
  return text;
}

/** "404.95" -> 40495. Digits past the second decimal place are dropped. */
export function moneyToCents(value: unknown): number {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string') throw new Error('Invalid money amount');
  const m = /^(\d{1,12})(?:\.(\d+))?$/.exec(text.trim());
  if (!m) throw new Error('Invalid money amount');
  const cents = Number(m[1]) * 100 + Number(((m[2] || '') + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) throw new Error('Invalid money amount');
  return cents;
}

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : null;
}

function shopMoney(set: unknown): { amount: unknown; currency: unknown } | null {
  const money = obj(obj(set)?.shop_money);
  return money ? { amount: money.amount, currency: money.currency_code } : null;
}

export type PaidOrderParse =
  | { ok: true; orderId: string; customerId: string; orderName: string | null; amountCents: number }
  | { ok: false; reason: string };

const PAID_STATUSES = new Set(['paid', 'partially_refunded', 'refunded']);

/**
 * orders/paid payload -> award input. Points are based on the order
 * subtotal in shop money: after discounts, before shipping. Refunds are
 * handled separately, so the original subtotal is used, not the current one.
 */
export function parsePaidOrder(payload: unknown, opts: { currency: string; allowTestOrders: boolean }): PaidOrderParse {
  const order = obj(payload);
  if (!order) return { ok: false, reason: 'invalid_payload' };
  if (order.test === true && !opts.allowTestOrders) return { ok: false, reason: 'ignored_test_order' };
  const customer = obj(order.customer);
  if (!customer) return { ok: false, reason: 'ignored_guest_checkout' };
  if (typeof order.financial_status !== 'string' || !PAID_STATUSES.has(order.financial_status)) {
    return { ok: false, reason: 'ignored_not_paid' };
  }
  const subtotal = shopMoney(order.subtotal_price_set);
  if (!subtotal) return { ok: false, reason: 'invalid_payload' };
  if (subtotal.currency !== opts.currency) return { ok: false, reason: 'ignored_currency' };
  try {
    return {
      ok: true,
      orderId: idFrom(order.admin_graphql_api_id ?? order.id, 'Order'),
      customerId: idFrom(customer.admin_graphql_api_id ?? customer.id, 'Customer'),
      orderName: typeof order.name === 'string' ? order.name.slice(0, 64) : null,
      amountCents: moneyToCents(subtotal.amount),
    };
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }
}

export type RefundParse =
  | { ok: true; refundId: string; orderId: string; amountCents: number }
  | { ok: false; reason: string };

/**
 * refunds/create payload -> refunded merchandise in cents: the sum of the
 * refunded line items' subtotals. A refund with no line items (an amount
 * typed in by staff) uses its successful refund transactions minus any
 * refunded shipping, so a shipping-only refund takes no points back.
 */
export function parseRefund(payload: unknown, opts: { currency: string }): RefundParse {
  const refund = obj(payload);
  if (!refund) return { ok: false, reason: 'invalid_payload' };
  try {
    const refundId = idFrom(refund.admin_graphql_api_id ?? refund.id, 'Refund');
    const orderId = idFrom(refund.order_id, 'Order');
    let cents = 0;
    const lines = Array.isArray(refund.refund_line_items) ? refund.refund_line_items : [];
    for (const line of lines) {
      const money = shopMoney(obj(line)?.subtotal_set);
      if (!money) throw new Error('line without subtotal');
      if (money.currency !== opts.currency) return { ok: false, reason: 'ignored_currency' };
      cents += moneyToCents(money.amount);
    }
    if (lines.length === 0) {
      const txs = Array.isArray(refund.transactions) ? refund.transactions : [];
      for (const raw of txs) {
        const tx = obj(raw);
        if (!tx || tx.kind !== 'refund' || tx.status !== 'success') continue;
        if (tx.currency != null && tx.currency !== opts.currency) return { ok: false, reason: 'ignored_currency' };
        cents += moneyToCents(tx.amount);
      }
      let shipping = 0;
      const shippingLines = Array.isArray(refund.refund_shipping_lines) ? refund.refund_shipping_lines : [];
      for (const line of shippingLines) {
        const money = shopMoney(obj(line)?.subtotal_amount_set);
        if (money) shipping += moneyToCents(money.amount);
      }
      // Before API 2024-10 refunded shipping came as an order adjustment.
      const adjustments = Array.isArray(refund.order_adjustments) ? refund.order_adjustments : [];
      for (const raw of adjustments) {
        const adj = obj(raw);
        const money = adj && adj.kind === 'shipping_refund' ? shopMoney(adj.amount_set) : null;
        if (money) shipping += moneyToCents(String(money.amount).replace(/^-/, ''));
      }
      cents = Math.max(cents - shipping, 0);
    }
    return { ok: true, refundId, orderId, amountCents: cents };
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }
}
