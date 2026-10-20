import type { VercelRequest, VercelResponse } from '@vercel/node';

// Points API - earn, burn, get balance
// In production, connect to a database (Postgres via Vercel Postgres or Supabase)
// For now, this demonstrates the API contract

const TIER_MULTIPLIERS: Record<string, number> = {
  silver: 1,
  gold: 1.5,
  diamond: 2,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { customerId, action, amount, description } = req.body || req.query;

  if (!customerId) {
    return res.status(400).json({ error: 'customerId required' });
  }

  if (req.method === 'GET') {
    // GET /api/loyalty/points?customerId=xxx
    // TODO: query database for current balance and transactions
    return res.status(200).json({
      customerId,
      points: 0,
      tier: 'silver',
      totalSpent: 0,
      transactions: [],
    });
  }

  if (req.method === 'POST') {
    if (action === 'earn') {
      // Award points for a purchase
      // TODO: write to database with idempotency key (order ID)
      const tier = 'silver'; // TODO: look up customer tier
      const multiplier = TIER_MULTIPLIERS[tier] || 1;
      const earned = Math.round((amount || 0) * multiplier);
      return res.status(200).json({ earned, balance: earned });
    }

    if (action === 'burn') {
      // Redeem points for a voucher
      // TODO: validate balance, create Shopify discount code
      return res.status(200).json({ redeemed: amount, voucherCode: 'POINTS' + Math.random().toString(36).slice(2, 8).toUpperCase() });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
