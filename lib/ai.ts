// AI Service - product assistant + medical data analysis + health summaries
// In production this calls our backend proxy which holds the LLM API key
// Medical data is sent ephemerally for analysis, NOT stored

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  productSuggestions?: { title: string; handle: string; price: string }[];
}

export interface AnalysisResult {
  type: string;
  period: string;
  analysis: string;
  generatedAt: string;
}

export interface SummaryResult {
  period: string;
  format: string;
  summary: string;
  generatedAt: string;
}

// --- Product Assistant (chat) ---

export async function sendChatMessage(
  messages: ChatMessage[],
  userMessage: string
): Promise<ChatMessage> {
  if (BACKEND_URL) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, userMessage }),
      });
      if (response.ok) {
        const data = await response.json();
        return { role: 'assistant', content: data.content };
      }
    } catch {
      // fall through to dev response
    }
  }
  return devAssistantResponse(userMessage);
}

// --- Medical Data Analysis (HEARD-style pattern analysis) ---

export async function analyzeMedicalData(
  type: 'vitals' | 'wound' | 'ostomy' | 'intake-output' | 'compression' | 'all',
  data: Record<string, unknown>,
  period?: string
): Promise<AnalysisResult | null> {
  if (!BACKEND_URL) return null;
  try {
    const response = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data, period }),
    });
    if (response.ok) return response.json();
    return null;
  } catch {
    return null;
  }
}

// --- Health Summary (doctor-friendly reports) ---

export async function generateHealthSummary(
  data: Record<string, unknown>,
  period: 'daily' | 'weekly' | 'monthly' | 'custom' = 'weekly'
): Promise<SummaryResult | null> {
  if (!BACKEND_URL) return null;
  try {
    const response = await fetch(`${BACKEND_URL}/api/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, period }),
    });
    if (response.ok) return response.json();
    return null;
  } catch {
    return null;
  }
}

// --- Dev fallback (no backend connected) ---

async function devAssistantResponse(message: string): Promise<ChatMessage> {
  const lower = message.toLowerCase();
  let content = '';
  let suggestions: { title: string; handle: string; price: string }[] = [];

  if (lower.includes('wound') || lower.includes('cut') || lower.includes('ulcer')) {
    content = `For wound care, I can help you find the right dressing. A few things to consider:\n\n1. How much drainage (exudate) does the wound have?\n2. Is it a chronic ulcer or an acute cut?\n3. What size is the wound?\n\nBased on your needs, here are products our customers often use:`;
    suggestions = [
      { title: 'Convatec Esenta Sting Free Adhesive Remover', handle: 'convatec-esenta', price: 'From $18.90' },
    ];
  } else if (lower.includes('ostomy') || lower.includes('stoma') || lower.includes('colostomy') || lower.includes('ileostomy')) {
    content = `For ostomy care, the key products are:\n\n1. Pouches/bags - one-piece or two-piece systems\n2. Barriers/wafer - skin protection around the stoma\n3. Accessories - adhesive remover, deodorant, belts\n\nTell me:\n- Do you use a one-piece or two-piece system?\n- What's your stoma size?\n- Any skin irritation issues?\n\nHere are popular options:`;
    suggestions = [
      { title: 'Convatec Ostomy Products', handle: 'convatec', price: 'View range' },
      { title: 'Coloplast Ostomy Products', handle: 'coloplast-ostomy-product', price: 'View range' },
    ];
  } else if (lower.includes('compression') || lower.includes('stocking') || lower.includes('varicose')) {
    content = `For compression stockings, getting the right size is important. You'll need to measure:\n\n- Ankle circumference (narrowest point)\n- Calf circumference (widest point)\n- Leg length (heel to knee)\n\nUse our Compression Measurement Tool in the Tools tab to find your size. Your doctor or therapist can advise on the appropriate compression level for your needs.`;
  } else if (lower.includes('delivery') || lower.includes('shipping') || lower.includes('ship')) {
    content = `We offer:\n- Free standard delivery for orders over $50 (Gold and Diamond members)\n- Standard delivery: 2-3 business days within Singapore\n- Express delivery: next business day\n\nYou can track your order anytime in the Orders tab.`;
  } else if (lower.includes('point') || lower.includes('reward') || lower.includes('voucher')) {
    content = `Our rewards program:\n- Earn 1 point per $1 spent (Silver), 1.5x (Gold), 2x (Diamond)\n- Redeem points for vouchers\n- Refer a friend and both get bonus points\n- Gold members get free shipping over $50\n- Diamond members get free shipping on everything!\n\nCheck your points in the Account tab.`;
  } else {
    content = `I can help you find the right products for wound care, ostomy supplies, compression wear, and daily living aids. What are you looking for?\n\nYou can also:\n- Browse by category in the Shop tab\n- Use our health measurement tools in the Tools tab\n- Track orders in the Orders tab\n\nRemember: I help with product selection only. For medical advice, please consult your doctor.`;
  }

  return { role: 'assistant', content, productSuggestions: suggestions };
}

export function getSystemPrompt() {
  return 'EMIS+ product selection assistant. Product guidance only, never medical advice.';
}
