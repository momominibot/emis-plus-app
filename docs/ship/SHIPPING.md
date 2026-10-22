# EMIS+ app: The App Shipping Method, applied

Status as of 22 October 2026. Method: `The App Shipping Method` v1.0 (nine phases, each with an exit gate; do not start Phase 7 until Phase 6 passes; loop back to the phase that failed). This app was already part-built when the method was applied, so phases 1 to 6 were written retroactively and their gates are judged honestly below.

| Phase | Gate | Status | Evidence |
|---|---|---|---|
| 01 Idea | Single fatal assumption named | PASS | Below |
| 02 Research | Expert map, competitor matrix, gaps, customer interviews | PARTIAL: desk research done, **0 customer interviews** | `RESEARCH.md` |
| 03 Synthesis | One outcome, one target opportunity, experiment per branch | PASS (experiments not yet run) | Below |
| 04 Strategize | GO recorded, appetite, distribution, out of scope | PASS | `DECISIONS.md` |
| 05 Plan | Brief with done criteria, metrics, second-model review | PARTIAL: **no analytics instrumented** | `BRIEF.md` |
| 06 Audit | Critical gates pass, risks logged with owner and date | PARTIAL: 3 open items owned by Jamie | `AUDIT.md` |
| 07 Build in loops | Works end to end with real data; a fresh session tried to break it | Loop 1 (aesthetic) in `LOOPS.md` | `LOOPS.md` |
| 08 Verify | Beta users, North Star moving, no P0, independent review | NOT STARTED (no beta cohort) | |
| 09 Ship | Live URL, monitoring, primary outcome and window | Preview only: https://momominibot.github.io/emis-plus-app/ (noindex). No monitoring. | |

Rule from the method: if any row is blank, return to that phase. The open rows are 02 (interviews), 05 (analytics), 06 (three owned items), 08 and 09.

## Phase 01: Idea

**Problem, in the customer's words (to be confirmed in interviews):** "I'm looking after my mum's wound / stoma at home and I don't know which dressing or pouch to buy, or whether what I'm seeing is normal."

**Who:** family carers and patients in Singapore managing a chronic wound, a stoma or compression at home; home-care nurses who advise them. **How often:** weekly to monthly reorders; a choice problem at every change of wound stage or appliance. **What they do today:** ask the hospital nurse at the next visit, buy what was used in hospital from a pharmacy, Shopee or Lazada, or search emis.asia blog posts.

**Leap-of-faith assumptions, ranked by fatality:**
1. **Carers will open an app to choose and reorder supplies instead of reordering where they already buy** (emis.asia site, Shopee, Lazada). If false, the app adds no sales and only duplicates the website. *This is the fatal one.*
2. Guided checks (Wound Product Advisor, Stoma Skin Check, hydration, sizing) reduce choice anxiety enough that people act on them.
3. People trust a store's education content (guides, reels) when it is clearly sourced and not pushy.
4. Health Points and referrals change reorder behaviour enough to pay for themselves.

## Phase 03: Synthesis (Opportunity Solution Tree)

- **Outcome:** carers and patients pick a suitable product type without waiting for a nurse, and reorder through EMIS+.
- **Measurable behaviour change:** share of guided-check completions that lead to a product page view, and of those, a tap on "Buy on emis.asia".
- **Opportunities:** (a) "I don't know which dressing fits this wound"; (b) "Is this skin around the stoma normal?"; (c) "Which compression size?"; (d) "I keep running out and reorder in a rush"; (e) "I don't understand what the nurse told me".
- **Target opportunity:** (a) choosing a dressing, the largest catalogue area (wound care collection holds 100+ products) and the most-viewed reel series.
- **Candidate solutions and planned experiments:**

| Opportunity | Solution in app | Experiment (not yet run) |
|---|---|---|
| (a) dressing choice | Wound Product Advisor, dressing reels with product links | 5 carers complete the advisor unaided; count completions and product taps |
| (b) peristomal skin | Stoma Skin Check, peristomal guide | Stoma nurse reviews 10 outputs against her own judgement |
| (c) compression size | Compression Sizing | Compare app size with fitter's size for 10 people |
| (d) reorder | Health Points (preview), sign-in branch | Reorder rate of signed-in users vs website, after launch |
| (e) understanding | Learn guides with sources, 13 reels | Comprehension check: 5 carers retell one guide |

**Cagan's four risks:** desirability (assumption 1, unproven), viability (sales go through existing emis.asia checkout, so no new payment cost; points cost not modelled), usability (screens reviewed by two models, not yet by users), feasibility (proven: tokenless Shopify, Supabase backend live).
