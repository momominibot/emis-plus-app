import type { VercelRequest, VercelResponse } from '@vercel/node';

// Referral API - generate codes, track referrals, award bonus points
// TODO: connect to database

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { customerId, referralCode, action } = req.body || req.query;

  if (req.method === 'POST' && action === 'generate') {
    // Generate a unique referral code for a customer
    if (!customerId) return res.status(400).json({ error: 'customerId required' });
    const code = 'EMIS' + Math.random().toString(36).slice(2, 8).toUpperCase();
    // TODO: store in database, ensure uniqueness
    return res.status(200).json({ code });
  }

  if (req.method === 'POST' && action === 'apply') {
    // New customer applies a referral code during signup
    if (!customerId || !referralCode) {
      return res.status(400).json({ error: 'customerId and referralCode required' });
    }
    // TODO:
    // 1. Validate referralCode exists and belongs to an existing customer
    // 2. Ensure customer hasn't already used a referral code
    // 3. Award 100 points to referrer
    // 4. Award 100 points to new customer (welcome bonus)
    return res.status(200).json({
      success: true,
      referrerBonus: 100,
      newCustomerBonus: 100,
    });
  }

  if (req.method === 'GET') {
    // Get referral stats for a customer
    if (!customerId) return res.status(400).json({ error: 'customerId required' });
    return res.status(200).json({
      code: referralCode || 'EMISXXXXXX',
      referralCount: 0,
      totalPointsEarned: 0,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
