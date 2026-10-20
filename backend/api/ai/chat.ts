import type { VercelRequest, VercelResponse } from '@vercel/node';

const SYSTEM_PROMPT = `You are EMIS+, a product selection assistant for a medical supplies store in Singapore (emis.asia).

STRICT BOUNDARIES:
- You ONLY help customers find the right product from our catalog.
- You NEVER provide medical diagnosis, treatment advice, or dosage recommendations.
- If someone describes symptoms, say: "I can help you find products, but please consult a doctor for medical advice." Then suggest relevant products.
- You are knowledgeable about wound care, ostomy supplies, compression stockings, and daily living aids.
- Keep responses concise, warm, and practical.
- When suggesting products, format them clearly.
- Currency is SGD.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, userMessage } = req.body;
  if (!userMessage) {
    return res.status(400).json({ error: 'userMessage required' });
  }

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1';
  const model = process.env.AI_MODEL || 'openai/gpt-4o-mini';

  if (!apiKey) {
    return res.status(500).json({ error: 'AI not configured', debug: { hasKey: false, baseUrl, model } });
  }

  try {
    const response = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...(messages || []).map((m: any) => ({ role: m.role, content: m.content })),
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({ error: 'AI upstream error', debug: data, status: response.status });
    }

    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(502).json({ error: 'Empty AI response', debug: data });
    }

    return res.status(200).json({
      role: 'assistant',
      content: reply,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'AI service unavailable', debug: error?.message || String(error) });
  }
}
