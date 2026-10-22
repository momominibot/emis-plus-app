# Decision log

One line per decision, newest last. Why in brackets.

- 2026-10-20: Build on the Expo app, port Learn and clinical tools from the older Next.js app (one app, not two).
- 2026-10-20: Shopify via Storefront API tokenless access; remove the backend's open Admin GraphQL passthrough (no key can leak; the passthrough could have read customers and orders).
- 2026-10-20: Learn replaces the Orders tab; Orders lives under Account (orders need sign-in; the old tab showed made-up orders with invented prices).
- 2026-10-20: Web preview on GitHub Pages, single-page export with 404.html fallback (fixes the crash and deep links).
- 2026-10-21: Learn leads with the "Wound care explained" reel series, 13 episodes (owner's latest series).
- 2026-10-21: Colour follows the EMIS+ logo, green only as primary; illustrations generated with Seedream (owner asked for professional graphics with a little motion).
- 2026-10-21: Illustrations on tinted surfaces must be background-free cutouts (owner rejected square images overlapping cards).
- 2026-10-21: Sign-in moves to Supabase Auth: Apple, Google, 6-digit email code (owner's direction).
- 2026-10-21: Reuse the idle mcsg-lease-desk Supabase project for EMIS+ (owner: "replace mcsg"; avoids a second US$10/month project).
- 2026-10-21: Delete the old Vercel backend (owner request; it served fake points data).
- 2026-10-22: Apply The App Shipping Method retroactively; phase docs in `docs/ship/`.
- 2026-10-22: GO on the web preview and TestFlight as the thin MVP; sign-in stays off until its gates pass. Appetite: two weeks to the first 5 user sessions. Distribution: link from emis.asia, YouTube reel descriptions, and nurses EMIS already supplies. Out of scope for v1: in-app checkout, AI chat, telehealth, Android store release, points launch.
- 2026-10-22: Contrast fixed to WCAG AA in both modes; deeper UI green #177A5C kept close to brand #209070 (measured failures at 4.29:1).
- 2026-10-22: Every tab shows a text label (both reviewers; older users).
- 2026-10-22: Product page parses descriptions and hides store-internal fields; the store itself is not changed without the owner's yes.
- 2026-10-22: The built-in assistant may not state prices, delivery terms or programme promises.
