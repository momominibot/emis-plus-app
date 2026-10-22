# Phase 07: Build loops

## Loop 1, 22 Oct 2026: aesthetics and trust

**Frame.** Owner asked to apply the shipping method and improve the app's look. Restore the live preview first (it had been force-pushed back to a crashing build).

**Stress (before building).** Eleven screenshots reviewed independently by Codex (7/10) and Doubao Seed 2.1 Pro vision (7/10); my own notes written before reading either. Agreement on: raw product descriptions with internal notes, broken assistant chips, unlabeled tabs and content under the floating bar, promotional rewards card, weak selected states, tall hero, truncated titles. Codex alone caught that Graze and Cut used the same picture (confirmed: zero pixel difference). Measured audit added: five contrast failures, no noindex on the preview, invented delivery terms and a hard-coded wrong price in the assistant, 76 store products exposing internal fields.

**Produce.** AA palette with onPrimary/primaryInk/controlBorder tokens; labelled floating tab bar; product page rebuilt on a description parser that hides internal fields and written prices; assistant answers without invented claims; selected and checkbox states; quieter Account; compact hero; new Cut illustration; noindex and contrast gate in `scripts/build-web.sh`.

**Check.** Codex break-it review: FAIL with 9 P1s (parser dropped div/br/nested-list text, header tables and plural SKUs leaked, fallback could restore a stale price, search did not refocus, five contrast pairs). All fixed; parser now has 21 tests (11 against live store products, 10 from the review's cases); `tools/contrast.py` 50/50; browser checks for search focus, noindex and page errors pass.

**Verify against reality.** Real Shopify data on every screen; screenshots in light mode (web is light-only by Expo's template; dark mode verified by calculation, not by screenshot).

**Verification round 1 (Codex):** 8 of 9 fixed; two-column header tables, multi-paragraph summaries and headerless 3-column tables still wrong. Fixed.

**Reality sweep:** `tests/catalogueSweep.mjs` parsed all 1,091 published products. Found 19 leaks (internal codes inside prose and values, row labels in header tables) and 4 products losing over a third of their text (whole paragraphs dropped for one price). Fixed with bracket-, sentence- and clause-level removal and dropping questions whose only answer was a price. Final: 0 leaks, 0 empty pages, 0 large losses; 36 parser tests.

**Verification round 2 (Codex):** ended without a verdict (no output, no usage-limit error). Not retried under the no-retry rule. **Owed:** one exhaustive Codex sweep of `git diff 19804fa..HEAD`.

Open after this loop: store descriptions (owner), analytics (owner), 5 user sessions (owner), the owed review.

## How to run a loop
1. `scripts/build-web.sh` (export, noindex, fallback, contrast gate)
2. `SCREENS=",shop,learn,tools,account,..." python3 tools/screens.py dist sheet.png`
3. Two independent reviews of the screenshots, own notes first
4. Build, then a fresh break-it review of the diff; fix until PASS
5. `node --experimental-strip-types tests/productDescription.test.mjs`
6. `scripts/deploy-web.sh`, then send the sheet
