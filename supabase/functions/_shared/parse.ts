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

/** "  Pat@Example.COM " -> "pat@example.com"; null if it is not an email address. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

/** A Shopify timestamp ("2026-10-01T11:00:00+08:00"), or null if it is not one. */
function isoTime(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}

function obj(value: unknown): Obj | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : null;
}

function shopMoney(set: unknown): { amount: unknown; currency: unknown } | null {
  const money = obj(obj(set)?.shop_money);
  return money ? { amount: money.amount, currency: money.currency_code } : null;
}

export type PaidOrderParse =
  | {
      ok: true;
      orderId: string;
      /** Lowercased, trimmed: how orders are matched to members. */
      email: string;
      /** Shopify customer ID when the order has a customer (kept for a later ID-based link). */
      customerId: string | null;
      orderName: string | null;
      amountCents: number;
      presentmentCents: number | null;
      presentmentCurrency: string | null;
      taxesIncluded: boolean;
      /** When the order was placed (ISO 8601), used to price orders in payment order. */
      processedAt: string | null;
    }
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
  // The customer's email, else the order's contact email (guest checkouts count too).
  const email = normalizeEmail(customer?.email) ?? normalizeEmail(order.email) ?? normalizeEmail(order.contact_email);
  if (!email) return { ok: false, reason: 'ignored_no_email' };
  if (typeof order.financial_status !== 'string' || !PAID_STATUSES.has(order.financial_status)) {
    return { ok: false, reason: 'ignored_not_paid' };
  }
  const subtotal = shopMoney(order.subtotal_price_set);
  if (!subtotal) return { ok: false, reason: 'invalid_payload' };
  if (subtotal.currency !== opts.currency) return { ok: false, reason: 'ignored_currency' };
  const presentment = obj(obj(order.subtotal_price_set)?.presentment_money);
  try {
    const presentmentCurrency =
      typeof presentment?.currency_code === 'string' && /^[A-Z]{3}$/.test(presentment.currency_code) ? presentment.currency_code : null;
    return {
      ok: true,
      orderId: idFrom(order.admin_graphql_api_id ?? order.id, 'Order'),
      email,
      customerId: customer && (customer.admin_graphql_api_id ?? customer.id) != null
        ? idFrom(customer.admin_graphql_api_id ?? customer.id, 'Customer')
        : null,
      orderName: typeof order.name === 'string' ? order.name.slice(0, 64) : null,
      amountCents: moneyToCents(subtotal.amount),
      presentmentCents: presentmentCurrency ? moneyToCents(presentment!.amount) : null,
      presentmentCurrency,
      // Unknown counts as tax-inclusive (Singapore prices include GST), which claws back more, not less.
      taxesIncluded: order.taxes_included !== false,
      processedAt: isoTime(order.processed_at) ?? isoTime(order.created_at),
    };
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }
}

export type RefundParse =
  | {
      ok: true;
      refundId: string;
      orderId: string;
      lineCents: number;
      lineTaxCents: number;
      txCents: number;
      txCurrency: string | null;
      otherCents: number;
      /** Exclusions and item tax in the money-returned currency; null when the payload lacks them. */
      otherPresentmentCents: number | null;
      lineTaxPresentmentCents: number | null;
    }
  | { ok: false; reason: string };

/**
 * refunds/create payload -> the parts the database needs to work out the
 * refunded merchandise against its order (loyalty.apply_refund): refunded
 * items and their tax, money returned to the customer (successful or
 * pending, in its own currency) and refunded shipping, shipping tax, duties
 * and extra fees. Amounts that are excluded from merchandise are read in
 * shop money and, where present, in the customer's (presentment) money.
 */
export function parseRefund(payload: unknown, opts: { currency: string }): RefundParse {
  const refund = obj(payload);
  if (!refund) return { ok: false, reason: 'invalid_payload' };
  const shopCents = (set: unknown): number => {
    const money = shopMoney(set);
    if (!money) return 0;
    if (money.currency !== opts.currency) throw new CurrencyError();
    return moneyToCents(String(money.amount).replace(/^-/, ''));
  };
  // Presentment amounts; `missing` turns true if any non-zero part lacks one.
  let missing = false;
  const presentCents = (set: unknown): number => {
    const money = obj(obj(set)?.presentment_money);
    if (!money) {
      if (shopMoney(set) && shopCents(set) > 0) missing = true;
      return 0;
    }
    return moneyToCents(String(money.amount).replace(/^-/, ''));
  };
  try {
    const refundId = idFrom(refund.admin_graphql_api_id ?? refund.id, 'Refund');
    const orderId = idFrom(refund.order_id, 'Order');

    let lineCents = 0;
    let lineTaxCents = 0;
    let lineTaxPresentment = 0;
    for (const raw of Array.isArray(refund.refund_line_items) ? refund.refund_line_items : []) {
      const line = obj(raw);
      if (!line || !shopMoney(line.subtotal_set)) throw new Error('line without subtotal');
      lineCents += shopCents(line.subtotal_set);
      lineTaxCents += shopCents(line.total_tax_set);
      lineTaxPresentment += presentCents(line.total_tax_set);
    }
    const lineTaxMissing = missing;
    missing = false;

    let txCents = 0;
    let txCurrency: string | null = null;
    for (const raw of Array.isArray(refund.transactions) ? refund.transactions : []) {
      const tx = obj(raw);
      if (!tx || tx.kind !== 'refund' || (tx.status !== 'success' && tx.status !== 'pending')) continue;
      const currency = typeof tx.currency === 'string' && tx.currency !== opts.currency ? tx.currency : null;
      if (currency !== null && !/^[A-Z]{3}$/.test(currency)) throw new Error('bad currency');
      if (txCents > 0 && currency !== txCurrency) throw new Error('mixed refund currencies');
      txCurrency = currency;
      txCents += moneyToCents(tx.amount);
    }

    let otherCents = shopCents(refund.total_duties_set) + shopCents(refund.total_additional_fees_set);
    let otherPresentment = presentCents(refund.total_duties_set) + presentCents(refund.total_additional_fees_set);
    for (const raw of Array.isArray(refund.refund_shipping_lines) ? refund.refund_shipping_lines : []) {
      const line = obj(raw);
      const shipping = shopCents(line?.subtotal_amount_set);
      otherCents += shipping;
      otherPresentment += presentCents(line?.subtotal_amount_set);
      if (line?.tax_amount_set) {
        otherCents += shopCents(line.tax_amount_set);
        otherPresentment += presentCents(line.tax_amount_set);
      } else {
        otherCents += shippingTaxShare(obj(line?.shipping_line), shipping, shopCents);
        otherPresentment += shippingTaxShare(obj(line?.shipping_line), presentCents(line?.subtotal_amount_set), presentCents);
      }
    }
    // Before API 2024-10 refunded shipping came as an order adjustment.
    for (const raw of Array.isArray(refund.order_adjustments) ? refund.order_adjustments : []) {
      const adj = obj(raw);
      if (adj?.kind === 'shipping_refund') {
        otherCents += shopCents(adj.amount_set) + shopCents(adj.tax_amount_set);
        otherPresentment += presentCents(adj.amount_set) + presentCents(adj.tax_amount_set);
      }
    }

    return {
      ok: true, refundId, orderId, lineCents, lineTaxCents, txCents, txCurrency, otherCents,
      otherPresentmentCents: missing ? null : otherPresentment,
      lineTaxPresentmentCents: lineTaxMissing ? null : lineTaxPresentment,
    };
  } catch (err) {
    return { ok: false, reason: err instanceof CurrencyError ? 'ignored_currency' : 'invalid_payload' };
  }
}

class CurrencyError extends Error {}

/**
 * Tax on a refunded shipping line when the payload has no tax amount for
 * the refund itself: the shipping line's tax, pro rata to the part of its
 * price that was refunded.
 */
function shippingTaxShare(shippingLine: Obj | null, refundedCents: number, cents: (set: unknown) => number): number {
  if (!shippingLine || refundedCents <= 0) return 0;
  // What the customer actually paid for shipping, after shipping discounts.
  const price = cents(shippingLine.discounted_price_set ?? shippingLine.price_set);
  let tax = 0;
  for (const raw of Array.isArray(shippingLine.tax_lines) ? shippingLine.tax_lines : []) tax += cents(obj(raw)?.price_set);
  if (!price || !tax) return 0;
  return Math.round((tax * Math.min(refundedCents, price)) / price);
}
