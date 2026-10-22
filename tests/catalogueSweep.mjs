// Run: node --experimental-strip-types tests/catalogueSweep.mjs
// Parses every published product description and reports leaks and big text losses.
import { parseDescription } from '../lib/productDescription.ts';
const URL = 'https://4a6920-67.myshopify.com/api/2026-10/graphql.json';
const INTERNAL = /emis\+?\s*title|shopify product type|variant refs?|\bSKUs?\b[\s:#]*[A-Z0-9][A-Z0-9-]{3,}|\(SKU|store price|correct the variant/;
const MONEY = /(?:S\$|SGD|US\$|\$)\s?\d|\d\s?SGD\b/i;
const plain = h => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
let after = null, n = 0, leaks = [], losses = [], empties = [];
for (;;) {
  const q = `{ products(first:100${after ? `, after:"${after}"` : ''}){ pageInfo{hasNextPage endCursor} edges{ node{ handle descriptionHtml } } } }`;
  const d = await (await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })).json();
  for (const { node } of d.data.products.edges) {
    n++;
    const html = node.descriptionHtml || '';
    const blocks = parseDescription(html);
    const out = blocks.map(b => b.type === 'spec' ? `${b.key} ${b.value}` : b.text).join(' ');
    if (INTERNAL.test(out) || MONEY.test(out)) leaks.push(node.handle);
    const src = plain(html);
    if (src.length > 80 && !blocks.length) empties.push(node.handle);
    // Expected removals: internal rows, labels and money lines. Flag losses beyond 35% of the text.
    const srcClean = src.replace(/(EMIS\+ title|Shopify product type|Variant REFs \/ SKUs|Store price \(SGD\))[^|]{0,120}/gi, '');
    if (srcClean.length > 200 && out.length < srcClean.length * 0.65) losses.push(`${node.handle} kept ${out.length}/${srcClean.length}`);
  }
  if (!d.data.products.pageInfo.hasNextPage) break;
  after = d.data.products.pageInfo.endCursor; await new Promise(r => setTimeout(r, 600));
}
console.log(`products ${n}; leaks ${leaks.length}; empty from non-empty ${empties.length}; text losses over 35% ${losses.length}`);
for (const [k, v] of [['LEAK', leaks], ['EMPTY', empties], ['LOSS', losses]]) v.slice(0, 8).forEach(x => console.log(k, x));
process.exitCode = leaks.length || empties.length ? 1 : 0;
