// Edge function: Shopify orders/paid and refunds/create -> Health Points.
// Deploy with verify_jwt = false (Shopify signs with HMAC, not a Supabase JWT).
//
// Secrets: SHOPIFY_WEBHOOK_SECRET (required), SHOPIFY_SHOP_DOMAIN,
// LOYALTY_CURRENCY, ALLOW_TEST_ORDERS. SUPABASE_DB_URL is provided by Supabase.

import { createLoyaltyDb } from '../_shared/db.ts';
import { handleShopifyWebhook } from '../_shared/webhook.ts';

const db = createLoyaltyDb(Deno.env.get('SUPABASE_DB_URL') ?? '');

Deno.serve((req) =>
  handleShopifyWebhook(req, {
    secret: Deno.env.get('SHOPIFY_WEBHOOK_SECRET') ?? '',
    shopDomain: Deno.env.get('SHOPIFY_SHOP_DOMAIN') ?? '4a6920-67.myshopify.com',
    currency: Deno.env.get('LOYALTY_CURRENCY') ?? 'SGD',
    allowTestOrders: Deno.env.get('ALLOW_TEST_ORDERS') === 'true',
    db,
    log: (event) => console.log(JSON.stringify(event)),
  })
);
