import type { VercelRequest, VercelResponse } from '@vercel/node';

// Medical Data Analysis Agent - HEARD-style pattern analysis
// Accepts local medical data, analyzes with LLM, returns insights
// Data is NOT stored - ephemeral analysis only

const ANALYSIS_SYSTEM_PROMPT = `You are EMIS+ Health Analysis AI. You analyze patient-reported medical data and provide pattern insights.

STRICT BOUNDARIES:
- You identify TRENDS and PATTERNS in the data provided.
- You NEVER diagnose, prescribe, or recommend treatment changes.
- You flag values outside normal ranges and suggest "discuss with your doctor."
- You use plain, warm language suitable for patients and caregivers.
- For doctors, you provide structured observations.
- All observations must be grounded in the data provided. Do not invent data points.

Normal ranges for reference (flag if outside):
- Blood pressure: systolic 90-140, diastolic 60-90 mmHg
- Heart rate: 60-100 bpm
- Blood sugar (fasting): 4.0-7.0 mmol/L or 70-130 mg/dL
- Blood sugar (post-meal): < 10 mmol/L or < 180 mg/dL
- Temperature: 36.1-37.2 C
- Oxygen saturation: 95-100%
- Respiratory rate: 12-20 breaths/min
- Daily fluid intake: 1500-2500 mL
- Daily urine output: 800-2000 mL
- Ostomy output: varies, but sudden increase/decrease值得 noting

Output format:
1. Key observations (2-4 bullet points)
2. Trends noted (improving/stable/worsening)
3. Items to discuss with doctor (if any)
4. Encouraging closing note`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, data, period } = req.body;

  if (!type || !data) {
    return res.status(400).json({ error: 'type and data required' });
  }

  const validTypes = ['vitals', 'wound', 'ostomy', 'intake-output', 'compression', 'all'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid type. Must be one of: ' + validTypes.join(', ') });
  }

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;

  if (!apiKey) {
    return res.status(500).json({ error: 'AI not configured' });
  }

  const typeLabels: Record<string, string> = {
    vitals: 'Vital Signs',
    wound: 'Wound Tracking',
    ostomy: 'Ostomy Log',
    'intake-output': 'Intake & Output Chart',
    compression: 'Compression Stocking Measurements',
    all: 'All Health Data',
  };

  const userPrompt = `Analyze the following ${typeLabels[type]} data${period ? ' for ' + period : ''}:

${JSON.stringify(data, null, 2)}

Provide your analysis in the specified format.`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 800,
      }),
    });

    const result = await response.json();
    const analysis = result.choices?.[0]?.message?.content || 'Unable to generate analysis at this time.';

    return res.status(200).json({
      type,
      period: period || 'all available',
      analysis,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Analysis service unavailable' });
  }
}
