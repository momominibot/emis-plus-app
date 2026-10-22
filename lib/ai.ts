// AI Service - product assistant + medical data analysis + health summaries
// In production this calls our backend proxy which holds the LLM API key
// Medical data is sent ephemerally for analysis, NOT stored

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  productSuggestions?: { title: string; handle: string; price: string }[];
  links?: { title: string; url: string; note: string }[];
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

// --- Built-in answers (no AI proxy is connected) ---
// Only states what the app can stand behind: no prices, delivery terms or
// programme promises. Prices always come live from Shopify in the Shop tab.

export interface Suggestion { title: string; url: string; note: string }

async function devAssistantResponse(message: string): Promise<ChatMessage> {
  const lower = message.toLowerCase();
  let content = '';
  let links: Suggestion[] = [];

  if (lower.includes('wound') || lower.includes('cut') || lower.includes('ulcer') || lower.includes('dressing')) {
    content = `The quickest way to narrow down a dressing is the Wound Product Advisor in the Tools tab. It asks five short questions (wound type, how wet it is, signs of infection, depth, skin) and shows the dressing type that fits, with products from our store.\n\nIf the wound is spreading, very painful, or you feel unwell, please see a doctor first.`;
    links = [{ title: 'Wound care range', url: 'https://www.emis.asia/collections/wound-care-supplies-singapore', note: 'Browse on emis.asia' }];
  } else if (lower.includes('ostomy') || lower.includes('stoma') || lower.includes('colostomy') || lower.includes('ileostomy')) {
    content = `Ostomy supplies usually fall into three groups:\n\n1. Pouches: one-piece or two-piece systems\n2. Skin barriers and wafers\n3. Accessories: adhesive remover, barrier spray, belts\n\nIt helps to know your system (one-piece or two-piece), your stoma size and whether the skin around it is sore. The Stoma Skin Check in the Tools tab can help with the skin question.`;
    links = [
      { title: 'Convatec ostomy range', url: 'https://www.emis.asia/collections/convatec', note: 'Browse on emis.asia' },
      { title: 'Coloplast ostomy range', url: 'https://www.emis.asia/collections/coloplast-ostomy-product', note: 'Browse on emis.asia' },
    ];
  } else if (lower.includes('compression') || lower.includes('stocking') || lower.includes('varicose')) {
    content = `For compression stockings, size matters. You will need:\n\n- Ankle circumference (narrowest point)\n- Calf circumference (widest point)\n- Leg length (heel to knee)\n\nThe Compression Sizing tool in the Tools tab works out your size. Your doctor or therapist should advise on the compression level.`;
    links = [{ title: 'Compression stockings', url: 'https://www.emis.asia/collections/compression-stocking', note: 'Browse on emis.asia' }];
  } else if (lower.includes('delivery') || lower.includes('shipping') || lower.includes('ship')) {
    content = `Delivery options and fees are shown at checkout on emis.asia before you pay. If you have a question about an order, email hello@emis.asia.`;
  } else if (lower.includes('point') || lower.includes('reward') || lower.includes('voucher')) {
    content = `Health Points are in preview. For now your points and referral code are saved on this device only; the full programme starts with EMIS+ sign-in. You can see your points in the Account tab.`;
  } else {
    content = `I can point you to the right products for wound care, ostomy, compression and hygiene. What are you looking for?\n\nYou can also browse by category in the Shop tab, or use the guided checks in the Tools tab.\n\nI help with product selection only. For medical advice, please speak to your doctor or nurse.`;
  }

  return { role: 'assistant', content, links };
}

export function getSystemPrompt() {
  return 'EMIS+ product selection assistant. Product guidance only, never medical advice.';
}
