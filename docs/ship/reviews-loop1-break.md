1. **P1 · [lib/productDescription.ts:40](/Users/michiyomimi/code/emis-plus-app/lib/productDescription.ts:40): Description content silently disappears.** The valid fixture `<p>Overview</p><div>Do not use on damaged skin.</div>` renders only “Overview”. Nested lists lose instructions following a child list; unwrapped `<br>` content is skipped. **Fix:** traverse an HTML tree, preserving text nodes, block boundaries and nested lists.

2. **P1 · [app/product/[handle].tsx:35](/Users/michiyomimi/code/emis-plus-app/app/product/[handle].tsx:35): Fallback restores filtered prices.** An internal-only “Store price (SGD): S$18.90” table parses to `[]`, then returns through the unfiltered plain-description fallback. This can display an obsolete price beside Shopify’s current price. **Fix:** distinguish deliberately removed content from unsupported markup and sanitize the fallback.

3. **P1 · [lib/productDescription.ts:53](/Users/michiyomimi/code/emis-plus-app/lib/productDescription.ts:53): Header-based tables become incorrect specifications.** A table headed `Size | Store price | Variant REFs / SKUs` leaks prices and references because only the first cell is checked. Ordinary tables also lose column associations. **Fix:** preserve headers and filter entire internal columns before rendering.

4. **P1 · [lib/productDescription.ts:15](/Users/michiyomimi/code/emis-plus-app/lib/productDescription.ts:15): Plural SKU fields survive.** `<tr><td>SKUs</td><td>423290</td></tr>` appears unchanged because `\bsku\b` excludes “SKUs”. Paragraph-form internal fields bypass this filter too. **Fix:** normalize internal labels, support plurals, and apply filtering across block types.

5. **P1 · [app/(tabs)/shop.tsx:98](</Users/michiyomimi/code/emis-plus-app/app/(tabs)/shop.tsx:98>): Home search fails to focus an already-mounted Shop input.** Visit Shop, return Home, then tap search: changing `autoFocus` does not refocus the retained input. **Fix:** use an input ref and focus it on screen activation when requested; consume the request.

6. **P1 · [app/tools/export.tsx:95](/Users/michiyomimi/code/emis-plus-app/app/tools/export.tsx:95): White subtitle still fails AA.** The 12px, 80%-white text over primary measures **4.00:1 light / 1.67:1 dark**, below [4.5:1](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). **Fix:** use opaque `onPrimary`.

7. **P1 · [components/ReelCard.tsx:35](/Users/michiyomimi/code/emis-plus-app/components/ReelCard.tsx:35): Dark-mode “NEW” is unreadable.** White text over `#F2C35A` measures **1.65:1**. **Fix:** introduce an accessible `onAccent` foreground.

8. **P1 · [app/(tabs)/account.tsx:77](</Users/michiyomimi/code/emis-plus-app/app/(tabs)/account.tsx:77>), [index.tsx:158](</Users/michiyomimi/code/emis-plus-app/app/(tabs)/index.tsx:158>): Tier badges fail AA.** On the new light neutral fill, 12px Silver measures **4.08:1**, Gold **3.22:1**. **Fix:** darken tier text or use accessible neutral text.

9. **P1 · [components/clinical.tsx:178](/Users/michiyomimi/code/emis-plus-app/components/clinical.tsx:178): Unchecked checkbox outlines lose contrast.** New borders measure **1.82:1 light / 2.13:1 dark**, below the [3:1 control requirement](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). **Fix:** use `textTertiary` or a dedicated accessible control-border token.

FAIL

