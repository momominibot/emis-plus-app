# Phase 06: Audit

Run 22 October 2026. Measured where possible; opinions marked as such.

| Area | Check | Result | Owner | Revisit |
|---|---|---|---|---|
| Accessibility | Contrast of every text/fill token pair, computed (WCAG formula) | **Fixed this round.** Before: light primary on white 4.29:1, white on primary 4.29:1, amber text 2.95:1, dark-mode button text 1.91:1, dark hero title 1.36:1 (all fail AA). After: primary #177A5C 5.28:1 on white; onPrimary/primaryInk tokens give 7.7:1 and 10:1 in dark mode. | Claude | Every loop (script in LOOPS.md) |
| Accessibility | Labels on navigation | Fixed: every tab shows a text label; buttons have roles and labels | Claude | Every loop |
| Claims | No invented prices, delivery terms or programme promises | **Fixed this round.** The built-in assistant said "free standard delivery over $50", "express next business day", "Diamond free shipping on everything" and showed a hard-coded "From $18.90" for a S$38.16 product. Removed; answers now point to the tools, live catalogue and checkout. | Claude | Every loop |
| Claims | Tier perks in `lib/types.ts` ("Free shipping all orders", "Free gift with every order") | Not shown anywhere in the app, but unconfirmed. Must be confirmed before points launch. | **Jamie** | Before sign-in release |
| Store content | Product descriptions on emis.asia | **76 of 1,091 products show internal fields** to customers (EMIS+ title, Shopify product type, Variant REFs/SKUs, Store price); 1 shows an editing note ("Correct the variant SKU..."). The app hides them; the store pages still show them. Fixing the store needs a yes. | **Jamie** | Next store pass |
| Security | Secrets in the web bundle | None found (pattern scan for Shopify/OpenAI/service-role keys). Shopify access is tokenless. | Claude | Every deploy |
| Security | Old backend | Vercel project "backend" deleted 21 Oct 2026 (had an open Admin passthrough). | Done | |
| Privacy (PDPA) | Health records | Stay on the device; nothing uploaded. Sign-in branch adds email and points data on Supabase in Seoul: privacy notice must say so before release. | **Jamie** | Before sign-in release |
| SEO / GEO | Preview indexability | Preview had no noindex and could compete with emis.asia. **Fixed:** deploy adds `robots noindex, nofollow`. | Claude | Every deploy |
| Cost | Per user | Shopify Storefront: no cost. Supabase: existing Pro project (reused, no new spend). Illustrations: one-off Seedream renders (about 0.30 yuan each). No per-user AI cost (assistant uses built-in answers). | Claude | When AI chat is added |
| Medical content | Clinical tools and guides | Logic and text carried over unchanged from the reviewed web tools; sources shown in app. Two reels (compression, biofilm) had script safety notes on 15 and 17 Oct; published versions not re-checked. | **Jamie** | Before promoting those reels |
| Brand | EMIS+ name and logo | Owned brand assets used; no trademark search run. | Jamie | Before store listing |

Critical gates that pass: contrast, claims in app copy, secrets, indexability. Open with owner: store descriptions, tier perks, privacy notice for sign-in, reel re-check.
