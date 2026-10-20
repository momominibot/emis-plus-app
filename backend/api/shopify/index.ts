import { VercelRequest, VercelResponse } from '@vercel/node';

const SHOP_DOMAIN = process.env.SHOP_DOMAIN || '4a6920-67.myshopify.com';
const API_VERSION = '2025-10';
const ADMIN_URL = 'https://' + SHOP_DOMAIN + '/admin/api/' + API_VERSION + '/graphql.json';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'Shopify not configured on server' });
    return;
  }

  const { query, variables } = req.body;
  if (!query) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  try {
    const shopifyRes = await fetch(ADMIN_URL, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const data = await shopifyRes.json();
    res.status(shopifyRes.status).json(data);
  } catch (err: any) {
    res.status(502).json({ error: 'Upstream error: ' + err.message });
  }
}
