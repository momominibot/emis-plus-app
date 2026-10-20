import type { VercelRequest, VercelResponse } from '@vercel/node';

// Health Summary Generator - HEARD-style daily/weekly/monthly summaries
// Generates doctor-friendly reports from user's local data
// Data is NOT stored - ephemeral generation only

const SUMMARY_SYSTEM_PROMPT = `You are EMIS+ Health Summary AI. You generate clear, structured health summaries for patients and their doctors.

STRICT BOUNDARIES:
- You SUMMARIZE the data provided. You do NOT diagnose or prescribe.
- You organize findings by category (vitals, wound, ostomy, intake/output, etc.)
- You highlight notable changes, trends, and any out-of-range values.
- You include a "Questions for Doctor" section based on data patterns.
- Language is clear, professional, and warm.
- All statements must be grounded in the provided data.
- Include dates/time ranges where available.

Output structure:
# Health Summary
**Period:** [date range]
**Generated:** [date]

## Overview
[2-3 sentence summary of overall status]

## Vitals
[BP, heart rate, blood sugar, temp, SpO2 trends - only if data provided]

## Wound Care
[wound measurements, healing progress - only if data provided]

## Ostomy
[output patterns, consistency notes - only if data provided]

## Intake & Output
[fluid balance, notable days - only if data provided]

## Compression
[measurements, sizing notes - only if data provided]

## Notable Observations
[bullet list of key patterns]

## Questions for Doctor
[bullet list of items worth discussing]

## Reminders
[appointment reminders, medication adherence notes if provided]`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data, period, format } = req.body;

  if (!data) {
    return res.status(400).json({ error: 'data required' });
  }

  const validPeriods = ['daily', 'weekly', 'monthly', 'custom'];
  const summaryPeriod = validPeriods.includes(period) ? period : 'weekly';

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;

  if (!apiKey) {
    return res.status(500).json({ error: 'AI not configured' });
  }

  const userPrompt = `Generate a ${summaryPeriod} health summary from the following data:

${JSON.stringify(data, null, 2)}

Use the specified output structure. Only include sections where data is available.`;

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
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    const result = await response.json();
    const summary = result.choices?.[0]?.message?.content || 'Unable to generate summary at this time.';

    return res.status(200).json({
      period: summaryPeriod,
      format: format || 'markdown',
      summary,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Summary service unavailable' });
  }
}
