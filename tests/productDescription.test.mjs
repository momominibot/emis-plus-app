// Run: node --experimental-strip-types tests/productDescription.test.mjs
// Fetches three real products tokenless and checks the parser output.
import assert from 'node:assert/strict';
import { parseDescription } from '../lib/productDescription.ts';

const URL = 'https://4a6920-67.myshopify.com/api/2026-10/graphql.json';
async function desc(handle) {
  const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `{ product(handle:"${handle}"){ descriptionHtml } }` }) });
  return (await r.json()).data.product.descriptionHtml;
}
let pass = 0;
function ok(cond, msg) { assert.ok(cond, msg); pass++; }

// 1. Esenta: internal spec rows and the editing note must not survive.
const es = parseDescription(await desc('convatec-esenta-sting-free-adhesive-remover-aerosol-spray-150ml'));
const esText = JSON.stringify(es);
ok(!/Shopify|EMIS\+ title|Variant REFs|Store price|Correct the variant/i.test(esText), 'internal fields removed');
ok(es.some(b => b.type === 'summary'), 'summary kept');
ok(es.some(b => b.type === 'spec' && /brand/i.test(b.key)), 'real spec rows kept');
ok(!es.some((b, i) => b.type === 'heading' && (!es[i + 1] || es[i + 1].type === 'heading')), 'no empty headings');

// 2. Ceradan: check-mark paragraphs become bullets, prose stays paragraphs.
const ce = parseDescription(await desc('ceradan-advanced-emollient-wash-500ml'));
ok(ce.filter(b => b.type === 'bullet').length >= 5, 'check-mark lines become bullets');
ok(ce.some(b => b.type === 'para' && /Octenidine/.test(b.text)), 'prose kept');
ok(!ce.some(b => /^✓/.test(b.text)), 'bullet marks stripped');

// 3. Synthetic edge cases.
const syn = parseDescription('<h2>Overview</h2><p>Correct the variant SKU in Shopify.</p><h2>Use</h2><p>Spray &amp; wait&nbsp;10&#160;s.</p><table><tr><td>Shopify product type</td><td>X</td></tr><tr><td>Size</td><td>150 ml</td></tr></table>');
ok(!syn.some(b => b.type === 'heading' && b.text === 'Overview'), 'heading emptied by a removed note is dropped');
ok(syn.some(b => b.type === 'para' && b.text === 'Spray & wait 10 s.'), 'entities decoded');
ok(syn.length === 3 && syn[2].type === 'spec' && syn[2].key === 'Size', 'only the real spec row kept');
ok(parseDescription('').length === 0 && parseDescription(null).length === 0, 'empty input');

console.log(`productDescription: ${pass} checks passed`);

// 4. Cases from the Codex break-it review (22 Oct 2026).
const t = (h) => parseDescription(h);
const txt = (bs) => bs.map(b => b.type === 'spec' ? `${b.key}=${b.value}` : b.text).join(' | ');
ok(/Do not use on damaged skin/.test(txt(t('<p>Overview</p><div>Do not use on damaged skin.</div>'))), 'div-only text kept');
const nested = txt(t('<ul><li>Clean the skin<ul><li>Pat dry</li></ul>then apply the barrier</li></ul>'));
ok(/Clean the skin/.test(nested) && /Pat dry/.test(nested) && /then apply the barrier/.test(nested), 'nested list text kept');
const br = t('<p>Line one<br>Line two<br/>Line three</p>');
ok(br.length === 3 && br[2].text === 'Line three', '<br> lines kept as separate paragraphs');
ok(t('<table><tr><td>Store price (SGD)</td><td>S$18.90</td></tr></table>').length === 0, 'internal-only table gives nothing');
const colTable = t('<table><tr><th>Size</th><th>Store price</th><th>Variant REFs / SKUs</th></tr><tr><td>10 x 10 cm</td><td>S$18.90</td><td>ABC123</td></tr></table>');
ok(!/18\.90|ABC123/.test(txt(colTable)) && /10 x 10 cm/.test(txt(colTable)), 'internal and price columns dropped, size kept');
const implicit = t('<table><tr><td>Size</td><td>Pieces</td><td>Price</td></tr><tr><td>Small</td><td>10</td><td>S$9.90</td></tr></table>');
ok(!/9\.90/.test(txt(implicit)) && /Small/.test(txt(implicit)) && /Pieces: 10/.test(txt(implicit)), 'implicit header table keeps columns, drops price');
ok(t('<table><tr><td>SKUs</td><td>423290</td></tr><tr><td>Size</td><td>150 ml</td></tr></table>').length === 1, 'plural SKUs row dropped');
ok(t('<p>SKU: 423290</p><p>Store price: S$36</p><p>Price: S$12</p><p>Use daily.</p>').length === 1, 'label:value internal and price lines dropped');
ok(t('<p>Offered at an affordable price for families.</p>').length === 1, 'the word price alone does not drop text');
ok(t('<h2>Pricing</h2><p>Bundle of 3 for S$90.</p><h2>Use</h2><p>Spray.</p>').map(b => b.text).join('|') === 'Use|Spray.', 'heading over a dropped price line goes too');
console.log(`productDescription: ${pass} checks passed in total`);

// 5. Cases from the Codex verification round (22 Oct 2026).
const thead2 = txt(t('<table><thead><tr><td>Size</td><td>Store price (SGD)</td></tr></thead><tbody><tr><td>150 ml</td><td>18.90</td></tr></tbody></table>'));
ok(!/18\.90|Store price/.test(thead2) && /150 ml/.test(thead2), 'two-column thead with a price column: price gone, size kept');
const td2 = txt(t('<table><tr><td>Size</td><td>Store price (SGD)</td></tr><tr><td>150 ml</td><td>18.90</td></tr></table>'));
ok(!/18\.90|Store price/.test(td2) && /150 ml/.test(td2), 'two-column td header naming a price column: price gone');
const sum = t('<div id="ai-summary"><p><strong>Clinical Summary:</strong> Use on intact skin.</p><p>Store price: S$12.</p></div>');
ok(sum.length === 1 && sum[0].type === 'summary' && sum[0].text === 'Use on intact skin.', 'safety line in summary survives next to a removed price');
const headerless = t('<table><tr><td>Small</td><td>White</td><td>Single pack</td></tr><tr><td>Large</td><td>Blue</td><td>Two packs</td></tr></table>');
ok(headerless.length === 2 && headerless[0].text === 'Small · White · Single pack' && headerless[1].text === 'Large · Blue · Two packs', 'headerless 3-column rows kept as written, no invented pairing');
const rowHeaders = t('<table><tr><th>Size</th><td>150 ml</td></tr><tr><th>Brand</th><td>Convatec</td></tr></table>');
ok(rowHeaders.length === 2 && rowHeaders[0].type === 'spec' && rowHeaders[0].key === 'Size', 'row-header (th + td) tables stay key/value');
const thHeader = txt(t('<table><tr><th>Size</th><th>Pieces</th></tr><tr><td>Small</td><td>10</td></tr></table>'));
ok(/Small/.test(thHeader) && /Pieces: 10/.test(thHeader), 'two-column th header keeps its labels');
console.log(`productDescription: ${pass} checks passed after verification fixes`);

// 6. Catalogue sweep findings (22 Oct 2026).
ok(txt(t('<table><tr><th>Item</th><th>Specification</th></tr><tr><td>SKU (EMIS)</td><td>23248313</td></tr><tr><td>Size</td><td>12 x 20 cm</td></tr></table>')) === 'Size=Specification: 12 x 20 cm', 'internal row label dropped in a header table');
ok(txt(t('<p>Silicone-based remover. SKUs SG-CON-1061-NSA / SG-CON-1061-NSA-2. Listed indications: removal of dressings.</p>')) === 'Silicone-based remover. Listed indications: removal of dressings.', 'SKU sentence removed, rest kept');
ok(txt(t('<table><tr><td>Product Code</td><td>Epidermal Repair (SKU S27)</td></tr></table>')) === 'Product Code=Epidermal Repair', 'SKU bracket removed from a value');
ok(txt(t('<p>Pouch-only SKUs. Coupling diameter must match the baseplate.</p>')).includes('Coupling diameter'), 'prose that only mentions SKUs keeps its sentences');
console.log(`productDescription: ${pass} checks passed after the catalogue sweep`);

// 7. Price sentences and brackets go; the rest of the paragraph stays.
ok(txt(t('<p>Stone Needle Mattress. SKU: MS-TL-0004. SGD 1,099. Full-body mattress made with bian stone.</p>')) === 'Stone Needle Mattress. Full-body mattress made with bian stone.', 'price and SKU sentences removed, description kept');
ok(txt(t('<li>Herbal Ointment 5 g: massage balm for tired shoulders (worth S$14.90)</li>')) === 'Herbal Ointment 5 g: massage balm for tired shoulders', 'price bracket removed from a list item');
ok(txt(t('<p>Save S$4.90 versus buying separately (S$45.00 vs S$49.90). Cabin friendly.</p>')) === 'Cabin friendly.', 'sentence with a decimal price removed whole');
console.log(`productDescription: ${pass} checks passed after sentence-level price removal`);

// 8. Clause-level price removal and orphaned questions (Dr Wang bundle, 22 Oct 2026).
ok(txt(t('<p>The Travel Pack keeps the tradition in your carry-on: two ointments plus the Roll-On, together at S$45.00 (component value S$49.90, save S$4.90). Every piece is cabin-size.</p>')) === 'The Travel Pack keeps the tradition in your carry-on: two ointments plus the Roll-On. Every piece is cabin-size.', 'price clause removed, sentence kept');
ok(txt(t('<p>Is it cabin-friendly?</p><p>Yes, under 100 ml.</p><p>How much do I save?</p><p>S$4.90 versus buying separately.</p><p>Where can I buy it?</p><p>From emis.asia.</p>')) === 'Is it cabin-friendly? | Yes, under 100 ml. | Where can I buy it? | From emis.asia.', 'question whose answer was a price is dropped');
console.log(`productDescription: ${pass} checks passed after clause-level removal`);
