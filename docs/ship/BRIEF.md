# Phase 05: Brief

## Architecture (as built)
- Expo SDK 57 + Expo Router, one codebase for iOS, Android and the web preview (GitHub Pages, single-page export, `scripts/deploy-web.sh`).
- Catalogue: Shopify Storefront API, tokenless (no key in the app). Checkout on emis.asia.
- Clinical tools: logic in `lib/clinical/*` copied byte-for-byte from the reviewed EMIS+ web tools (71 tests).
- Records: on-device only (SQLite native, localStorage on web).
- Accounts and Health Points: Supabase project `pgwenyjjjabzkaztkphd`, on branch `claude/emis-customer-accounts`, not released.

## Thin MVP (tests assumption 1)
Web preview plus TestFlight build with: Shop by need, Wound Product Advisor, Learn (guides and reels), product pages that hand off to emis.asia checkout. Sign-in and points stay off until the accounts gates pass.

## North Star
**Weekly guided-check-to-product handoffs:** number of people per week who finish a guided check (or watch a dressing reel) and then tap "Buy on emis.asia" on a product it suggested.

| Watch (should rise) | Guardrail (should stay low) |
|---|---|
| Guided checks completed per week | Taps on sold-out products |
| Product pages opened from a tool, guide or reel | Assistant questions it cannot answer |
| "Buy on emis.asia" taps | Sessions that end on an error or blank screen |

**Not instrumented yet.** The app sends no analytics. Choosing a privacy-respecting tool (no health data, no tool answers sent) is a decision for Jamie; until then the North Star cannot be measured and Phase 08 cannot pass.

## Done-and-good criteria for each build loop
- Works on the live preview with real Shopify data, no console errors.
- Text and buttons pass WCAG AA in light and dark mode (checked by script, not by eye).
- No invented price, delivery term or clinical claim anywhere in app copy.
- Two independent model reviews before, one break-it review after.
- Screenshot sheet sent to Jamie.
