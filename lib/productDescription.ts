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

// Internal codes and written prices inside customer prose: "(SKU S27)",
// "SKUs SG-CON-1061 / SG-CON-1062.", "(worth S$14.90)", "SGD 1,099.".
// Remove just that bracket or sentence and keep the rest of the paragraph.
const SKU_BRACKET = /\s*\(\s*SKUs?\b[^)]*\)/gi;
const MONEY_BRACKET = /\s*\([^)]*(?:(?:S\$|SGD|US\$|\$)\s?\d|\d\s?SGD\b)[^)]*\)/gi;
const SKU_CODE = /\bSKUs?\b[\s:#]*[A-Z0-9][A-Z0-9\-]{2,}/;

// Drop the comma clause that carries the price, not the whole sentence:
// "...plus the Roll-On, together at S$45.00." keeps "...plus the Roll-On."
function dropPriceClauses(sentence: string): string {
  if (!PRICE_TEXT.test(sentence)) return sentence;
  const end = /[.!?]$/.test(sentence) ? sentence.slice(-1) : '';
  const body = end ? sentence.slice(0, -1) : sentence;
  const clauses = body.split(/,\s+/);
  if (PRICE_TEXT.test(clauses[0])) return '';
  const kept = clauses.filter(c => !PRICE_TEXT.test(c));
  return kept.join(', ').replace(/\s+(?:at|for|from|only)$/i, '') + end;
}

function scrub(text: string): string {
  const t = text.replace(SKU_BRACKET, '').replace(MONEY_BRACKET, '');
  // Split into sentences at . ! ? followed by a space (so "S$4.90" stays whole).
  const kept = t.split(/(?<=[.!?])\s+/)
    .filter(sn => !SKU_CODE.test(sn))
    .map(dropPriceClauses)
    .filter(Boolean);
  return kept.join(' ').replace(/\s{2,}/g, ' ').trim();
}

function isInternalLine(text: string): boolean {
  if (EDITING_NOTE.test(text)) return true;
  // A short line that is only an internal or price label ("Store price (SGD)", "Variant REFs / SKUs").
  if (text.length <= 40 && (INTERNAL_LABEL.test(text) || /^(?:store\s*|retail\s*|unit\s*)?price\b/i.test(text))) return true;
  // "Label: value" lines whose label is internal, or any written price.
  const m = text.match(/^([^:]{1,40}):\s*(.*)$/);
  if (m && (INTERNAL_LABEL.test(m[1]) || PRICE_LABEL.test(m[1]))) return true;
  return PRICE_TEXT.test(text);
}

// --- tables -----------------------------------------------------------------

function tableBlocks(tableHtml: string): DescBlock[] {
  const theadHtml = (tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i) || [])[1] || '';
  const toRow = (html: string, inThead: boolean) => ({
    header: inThead || (/<th[\s>]/i.test(html) && !/<td[\s>]/i.test(html)),
    cells: [...html.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => scrub(inlineText(c[1]))),
  });
  const headRows = [...theadHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => toRow(r[1], true));
  const bodyHtml = theadHtml ? tableHtml.replace(/<thead[\s\S]*?<\/thead>/i, '') : tableHtml;
  const rows = [...headRows, ...[...bodyHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => toRow(r[1], false))]
    .filter(r => r.cells.some(Boolean));
  if (!rows.length) return [];
  const out: DescBlock[] = [];
  const first = rows[0];
  // A header row only when the HTML marks it (<thead>, <th>-only row), or when a
  // first-row cell names a column we must remove (internal field or price) and
  // carries no figures itself. Never guess headers from ordinary data rows.
  // In a two-column key/value table labels sit in the left column, so only a
  // removed label in a value position (or in a 3+ column row) marks a header.
  const namesRemovedColumn = rows.length > 1 && first.cells.length >= 2
    && first.cells.every(c => !c || !/\d/.test(c))
    && first.cells.some((c, i) => c && (first.cells.length >= 3 || i >= 1) && (INTERNAL_LABEL.test(c) || PRICE_LABEL.test(c)));
  if (first.header || namesRemovedColumn) {
    const heads = first.cells;
    const keep = heads.map(h => !INTERNAL_LABEL.test(h) && !PRICE_LABEL.test(h));
    for (const r of rows.slice(1)) {
      if (r.header) continue;
      // The row's own label (first cell) names an internal field or a price: drop the whole row.
      const label = r.cells[0] || '';
      if (label && (INTERNAL_LABEL.test(label) || PRICE_LABEL.test(label))) continue;
      const cols = r.cells.map((c, i) => ({ h: heads[i] || '', c, keep: keep[i] !== false }))
        .filter(x => x.keep && x.c && !isInternalLine(x.c));
      if (!cols.length) continue;
      const [lead, ...rest] = cols;
      if (INTERNAL_LABEL.test(lead.c) || PRICE_LABEL.test(lead.c)) continue;
      const value = rest.map(x => (x.h ? `${x.h}: ${x.c}` : x.c)).join(' · ');
      const key = lead.h && lead.h !== lead.c && cols.length === 1 ? lead.h : lead.c;
      if (value) out.push({ type: 'spec', key, value });
      else out.push(key === lead.c ? { type: 'para', text: lead.c } : { type: 'spec', key, value: lead.c });
    }
    return out;
  }
  for (const r of rows) {
    const cells = r.cells.filter(Boolean);
    if (cells.length === 2) {
      // Key / value row.
      const [k, v] = cells;
      if (INTERNAL_LABEL.test(k) || PRICE_LABEL.test(k) || isInternalLine(v) || isInternalLine(k)) continue;
      out.push({ type: 'spec', key: k, value: v });
    } else {
      // One cell, or a headerless multi-column row: keep it as written.
      const kept = cells.filter(c => !isInternalLine(c));
      if (kept.length) out.push({ type: 'para', text: kept.join(' · ') });
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
    // Filter line by line so a safety sentence survives next to a removed price.
    const lines = inner
      .replace(/<br\s*\/?>|<\/(p|li|div)>/gi, '\n')
      .split('\n')
      .map((l: string) => scrub(inlineText(l).replace(/^clinical summary:\s*/i, '')))
      .filter((l: string) => l && !isInternalLine(l));
    return hold(lines.length ? [{ type: 'summary', text: lines.join(' ') }] : []);
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
    const original = inlineText(raw.replace(/@@[HL]@@/g, ''));
    const text = scrub(original);
    if (!text || isInternalLine(text)) {
      // The removed line was an answer: drop the question it answered.
      const last = out[out.length - 1];
      if (original && last && (last.type === 'para' || last.type === 'heading') && /\?$/.test(last.text)) out.pop();
      continue;
    }
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
