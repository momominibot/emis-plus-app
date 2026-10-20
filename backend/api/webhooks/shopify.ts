import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Shopify Webhook Handler
// Receives order events and awards loyalty points
// Set up in Shopify Admin: Settings > Notifications > Webhooks
// Event: Order payment
// URL: https://your-backend.vercel.app/api/webhooks/shopify

const SHOPIFY_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';

function verifyWebhook(rawBody: string, hmacHeader: string): boolean {
  if (!SHOPIFY_SECRET) return true; // dev mode - skip verification
  const generatedHash = crypto
    .createHmac('sha256', SHOPIFY_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');
  return generatedHash === hmacHeader;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string;
  const topic = req.headers['x-shopify-topic'] as string;
  const rawBody = JSON.stringify(req.body);

  if (!verifyWebhook(rawBody, hmacHeader)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const order = req.body;

  if (topic === 'orders/paid') {
    const customerId = order.customer?.id;
    const orderId = order.id;
    const total = parseFloat(order.total_price || '0');
    const customerEmail = order.customer?.email;

    if (!customerId) {
      return res.status(200).json({ message: 'Guest checkout - no points awarded' });
    }

    // TODO:
    // 1. Check idempotency - have we already processed this order?
    // 2. Look up customer tier (silver/gold/diamond)
    // 3. Calculate points: total * tier_multiplier
    // 4. Award points to customer
    // 5. Check if customer tier should upgrade based on total spent
    // 6. If referral code was used at checkout, award referrer bonus

    console.log(`[Loyalty] Order ${orderId} paid: $${total} by customer ${customerId} (${customerEmail})`);

    return res.status(200).json({
      message: 'Order processed',
      orderId,
      customerId,
      pointsEarned: Math.round(total), // base 1 point per $1, multiplied by tier
    });
  }

  return res.status(200).json({ message: 'Webhook received', topic });
}
