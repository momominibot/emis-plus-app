// Shopify order webhooks -> Health Points.
//
// Every delivery is checked before anything is read from it: the HMAC of the
// raw body (fail closed when no secret is configured) and the shop domain.
// Awards and clawbacks are idempotent in the database, so Shopify retries,
// duplicate subscriptions and replayed bodies cannot double count.

import { parseJsonLossless, parsePaidOrder, parseRefund } from './parse.ts';
import type { LoyaltyDb } from './types.ts';

export interface WebhookConfig {
  /** Signing secret: the app's client secret, or the one shown in Admin > Settings > Notifications. */
  secret: string;
  /** Expected X-Shopify-Shop-Domain, e.g. 4a6920-67.myshopify.com. */
  shopDomain: string;
  currency: string;
  allowTestOrders: boolean;
  db: LoyaltyDb;
  log?: (event: Record<string, unknown>) => void;
}

const MAX_BODY_BYTES = 5 * 1024 * 1024;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.trim());
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Constant-time check of X-Shopify-Hmac-Sha256 against the raw body bytes. */
export async function verifyShopifyHmac(body: Uint8Array<ArrayBuffer>, header: string | null, secret: string): Promise<boolean> {
  if (!secret || !header) return false;
  const given = base64ToBytes(header);
  if (!given) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, body));
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given[i] ^ expected[i];
  return diff === 0;
}

export async function handleShopifyWebhook(req: Request, cfg: WebhookConfig): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!cfg.secret) {
    // Misconfigured: refuse rather than trust unsigned bodies. 503 lets Shopify retry once it is fixed.
    return json(503, { error: 'webhook_secret_not_configured' });
  }
  const declared = Number(req.headers.get('content-length') || '0');
  if (declared > MAX_BODY_BYTES) return json(413, { error: 'payload_too_large' });
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length > MAX_BODY_BYTES) return json(413, { error: 'payload_too_large' });

  if (!(await verifyShopifyHmac(body, req.headers.get('x-shopify-hmac-sha256'), cfg.secret))) {
    return json(401, { error: 'invalid_signature' });
  }
  const shop = (req.headers.get('x-shopify-shop-domain') || '').toLowerCase();
  if (shop !== cfg.shopDomain.toLowerCase()) return json(403, { error: 'unexpected_shop' });

  const topic = req.headers.get('x-shopify-topic') || '';
  const webhookIdHeader = req.headers.get('x-shopify-webhook-id');
  const webhookId = webhookIdHeader && webhookIdHeader.length <= 200 ? webhookIdHeader : null;

  let payload: unknown;
  try {
    payload = parseJsonLossless(new TextDecoder().decode(body));
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  let result: Record<string, unknown>;
  try {
    if (topic === 'orders/paid') {
      const order = parsePaidOrder(payload, { currency: cfg.currency, allowTestOrders: cfg.allowTestOrders });
      result = order.ok
        ? await cfg.db.recordPaidOrder({
            webhookId,
            orderId: order.orderId,
            email: order.email,
            customerId: order.customerId,
            orderName: order.orderName,
            amountCents: order.amountCents,
            presentmentCents: order.presentmentCents,
            presentmentCurrency: order.presentmentCurrency,
            taxesIncluded: order.taxesIncluded,
            processedAt: order.processedAt,
          })
        : { outcome: order.reason };
    } else if (topic === 'refunds/create') {
      const refund = parseRefund(payload, { currency: cfg.currency });
      result = refund.ok
        ? await cfg.db.recordRefund({
            webhookId,
            refundId: refund.refundId,
            orderId: refund.orderId,
            lineCents: refund.lineCents,
            lineTaxCents: refund.lineTaxCents,
            txCents: refund.txCents,
            txCurrency: refund.txCurrency,
            otherCents: refund.otherCents,
            otherPresentmentCents: refund.otherPresentmentCents,
            lineTaxPresentmentCents: refund.lineTaxPresentmentCents,
          })
        : { outcome: refund.reason };
    } else {
      result = { outcome: 'ignored_topic' };
    }
  } catch (err) {
    cfg.log?.({ level: 'error', topic, webhookId, error: err instanceof Error ? err.message : String(err) });
    // Non-2xx makes Shopify retry; the database calls are idempotent.
    return json(500, { error: 'processing_failed' });
  }

  cfg.log?.({ level: 'info', topic, webhookId, outcome: result.outcome });
  // invalid_payload is still acknowledged: a retry of the same body cannot succeed.
  return json(200, result);
}
