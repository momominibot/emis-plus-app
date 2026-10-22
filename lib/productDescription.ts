// Turns a Shopify product descriptionHtml into simple blocks the app can
// style, and drops store-internal fields that some descriptions carry
// (found on 76 of 1,091 products on 22 Oct 2026: "EMIS+ title",
// "Shopify product type", "Variant REFs / SKUs", "Store price (SGD)",
// plus one editing note). The store text itself should be cleaned too;
// this keeps them out of the app meanwhile.
//
// Rules: never drop customer text silently (div-only, <br>-separated and
// nested-list text all survive); never show a price from the description
// (prices come live from Shopify only); drop internal fields in any block
// shape: table rows, table columns, "Label: value" lines.

export type DescBlock =
  | { type: 'summary'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'para'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'spec'; key: string; value: string };

const INTERNAL_LABEL = /emis\+?\s*title|shopify|variant\s*refs?|\bskus?\b|store\s*prices?|\bhandle\b|vendor\s*id|product\s*id|internal/i;
const EDITING_NOTE = /correct the variant|in shopify|\btodo\b|placeholder|lorem ipsum/i;
// Any price written into the description: prices must come live from Shopify.
const PRICE_TEXT = /(?:S\$|SGD|US\$|\$)\s?\d|\d\s?(?:SGD|dollars)\b/i;
// Column or row labels about price: the whole column/row goes.
const PRICE_LABEL = /price|cost|\brrp\b/i;
const BULLET_MARK = /^\s*(?:[✓✔•·▪◦\-–]|\d+[.)])\s+/;

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: ', ', hellip: '...',
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', deg: '°', times: '×', reg: '®', trade: '™', copy: '©', bull: '•',
};

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function inlineText(html: string): string {
  return decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function isInternalLine(text: string): boolean {
  if (EDITING_NOTE.test(text)) return true;
  // "Label: value" lines whose label is internal, or any written price.
  const m = text.match(/^([^:]{1,40}):\s*(.*)$/);
  if (m && (INTERNAL_LABEL.test(m[1]) || PRICE_LABEL.test(m[1]))) return true;
  return PRICE_TEXT.test(text);
}

// --- tables -----------------------------------------------------------------

function tableBlocks(tableHtml: string): DescBlock[] {
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => ({
    header: /<th[\s>]/i.test(r[1]) && !/<td[\s>]/i.test(r[1]),
    cells: [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => inlineText(c[1])),
  })).filter(r => r.cells.some(Boolean));
  if (!rows.length) return [];
  const out: DescBlock[] = [];
  // A header row: explicit <th>, or a first row of 3+ short label-like cells over rows of the same width.
  const first = rows[0];
  const implicitHeader = first.cells.length >= 3 && rows.length > 1
    && rows.slice(1).every(r => r.cells.length === first.cells.length)
    && first.cells.every(c => c && c.length < 40 && !/\d{2,}/.test(c));
  const headerRow = first.header || implicitHeader ? first : null;
  if (headerRow) {
    // Column table: drop internal or price columns entirely, then one spec per row.
    const keep = headerRow.cells.map(h => !INTERNAL_LABEL.test(h) && !PRICE_LABEL.test(h));
    const heads = headerRow.cells;
    for (const r of rows.slice(1)) {
      const cols = r.cells.map((c, i) => ({ h: heads[i] || '', c, keep: keep[i] !== false })).filter(x => x.keep && x.c && !isInternalLine(x.c));
      if (!cols.length) continue;
      const [first, ...rest] = cols;
      const value = rest.map(x => (x.h ? `${x.h}: ${x.c}` : x.c)).join(' · ');
      out.push(value ? { type: 'spec', key: first.c, value } : { type: 'para', text: first.c });
    }
    return out;
  }
  for (const r of rows) {
    const [k, ...vs] = r.cells;
    const v = vs.filter(Boolean).join(' ');
    if (k && v) {
      if (INTERNAL_LABEL.test(k) || PRICE_LABEL.test(k) || isInternalLine(v)) continue;
      out.push({ type: 'spec', key: k, value: v });
    } else if (k || v) {
      const t = k || v;
      if (!isInternalLine(t)) out.push({ type: 'para', text: t });
    }
  }
  return out;
}

// --- document -----------------------------------------------------------------

export function parseDescription(html: string | null | undefined): DescBlock[] {
  if (!html) return [];
  let src = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');

  // Pull out pieces that need structure, leaving ordered placeholders.
  const pieces: DescBlock[][] = [];
  const hold = (blocks: DescBlock[]) => { pieces.push(blocks); return `\n@@P${pieces.length - 1}@@\n`; };
  src = src.replace(/<div[^>]*id="ai-summary"[^>]*>([\s\S]*?)<\/div>/gi, (_, inner) => {
    const text = inlineText(inner).replace(/^clinical summary:\s*/i, '');
    return hold(text && !isInternalLine(text) ? [{ type: 'summary', text }] : []);
  });
  src = src.replace(/<table[\s\S]*?<\/table>/gi, t => hold(tableBlocks(t)));

  // Mark block boundaries, headings and list items, then flatten to lines.
  src = src
    .replace(/<h[1-6][^>]*>/gi, '\n@@H@@')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n@@L@@')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|section|article|blockquote|tr|dd|dt)>/gi, '\n')
    .replace(/<(p|div|ul|ol|section|article|blockquote|dd|dt)[^>]*>/gi, '\n');

  const out: DescBlock[] = [];
  for (const raw of src.split('\n')) {
    const ph = raw.match(/@@P(\d+)@@/);
    if (ph) { out.push(...pieces[Number(ph[1])]); continue; }
    const heading = raw.includes('@@H@@');
    const listItem = raw.includes('@@L@@');
    const text = inlineText(raw.replace(/@@[HL]@@/g, ''));
    if (!text || isInternalLine(text)) continue;
    if (heading) out.push({ type: 'heading', text });
    else if (listItem || BULLET_MARK.test(text)) out.push({ type: 'bullet', text: text.replace(BULLET_MARK, '') });
    else out.push({ type: 'para', text });
  }

  // Drop headings left with nothing under them (their content was internal).
  return out.filter((b, i) => b.type !== 'heading' || (out[i + 1] !== undefined && out[i + 1].type !== 'heading'));
}

/** Plain-text fallback, only for products whose descriptionHtml is empty. */
export function plainParagraphs(text: string): DescBlock[] {
  return text.split(/\n+/).map(t => t.trim()).filter(t => t && !isInternalLine(t)).map(t => ({ type: 'para', text: t } as DescBlock));
}
