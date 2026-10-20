// Edge function: Health Points API for the EMIS+ app.
// Deploy with verify_jwt = false: callers present a Shopify Customer Account
// API token, which the handler checks with Shopify on every request.
//
// Secrets: LOYALTY_ALLOWED_ORIGINS (comma separated), CUSTOMER_ACCOUNT_API_URL.
// SUPABASE_DB_URL is provided by Supabase.

import { handleLoyaltyRequest } from '../_shared/api.ts';
import { createLoyaltyDb } from '../_shared/db.ts';

const db = createLoyaltyDb(Deno.env.get('SUPABASE_DB_URL') ?? '');
const allowedOrigins = (Deno.env.get('LOYALTY_ALLOWED_ORIGINS') ?? 'https://momominibot.github.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

Deno.serve((req) =>
  handleLoyaltyRequest(req, {
    db,
    customerApiUrl: Deno.env.get('CUSTOMER_ACCOUNT_API_URL') ??
      'https://shopify.com/61337632846/account/customer/api/2026-10/graphql',
    allowedOrigins,
    log: (event) => console.log(JSON.stringify(event)),
  })
);
