# EMIS+ Mobile App

A cross-platform mobile app for emis.asia - essential medical supplies store in Singapore.

## Features

### 5 Tabs
1. **Home** - Health Points balance and tier (when signed in), shop by need, new arrivals, AI assistant entry
2. **Shop** - Category browsing, product search, product grid, synced to Shopify
3. **Learn** - Six patient guides (wound healing, stoma care, nutrition and hydration), each with its clinical sources, plus the latest wound and stoma articles from the emis.asia blog
4. **Tools** - Guided checks and local-only medical records (never uploaded):
   - Wound Product Advisor (5 questions to a dressing type, care steps, referral urgency)
   - Stoma Skin Check (Ostomy Skin Tool DET score)
   - Stoma Output & Hydration check, St Mark's solution, food tips
   - Wound Nutrition calculator (protein, energy, fluid)
   - Compression stocking measurement calculator
   - Wound tracker with measurements
   - Ostomy output log
   - Intake & output chart
   - Vitals monitor (BP, HR, temp, SpO2, blood sugar, weight)
   - Export to doctor (CSV/summary) and device-to-device transfer
5. **Account** - Sign in (email code, Apple, Google via Supabase Auth), Health Points and tier, points history, referral code, order history

### AI Product Assistant
- Chat-based product selection helper
- Strict boundary: product recommendations only, never medical diagnosis
- Quick prompts for common questions

### Accounts and Health Points
- Sign-in: Supabase Auth, 6-digit email code, Sign in with Apple, Google (`lib/auth/`)
- Health Points: Supabase ledger keyed to the Supabase user, written only by HMAC-verified `orders/paid` and `refunds/create` webhooks and matched to users by confirmed email (`supabase/`)
- Orders: the member's matched paid orders, with points, plus a link to emis.asia for details
- Silver (1x points), Gold (1.5x, S$500), Diamond (2x, S$2,000); referral bonus of 100 points each after the friend's first paid order
- Not live yet: see [docs/ACCOUNTS.md](docs/ACCOUNTS.md) for the rules, tests and go-live steps

## Tech Stack
- **Frontend**: React Native + Expo SDK 57 + Expo Router (TypeScript)
- **Commerce**: Shopify Storefront API with tokenless access (products, collections, search, blog articles). No API key in the app or backend; checkout happens on emis.asia
- **Local Storage**: expo-sqlite (medical data, 100% on-device)
- **Backend**: Vercel serverless functions (AI proxy); Supabase edge functions + Postgres (Health Points, Shopify webhooks)
- **AI**: Volcengine Ark (Doubao) via backend proxy

## Quick Start

```bash
cd emis-app
npm install
npm start          # Expo dev server (scan QR with Expo Go)
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run web        # Web preview
```

### Environment
Create `.env` in the app root (client-side only, no secrets):
```
EXPO_PUBLIC_BACKEND_URL=https://your-backend.vercel.app
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co          # sign-in hidden while unset
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...      # public by design
EXPO_PUBLIC_AUTH_PROVIDERS=email,apple,google                # only providers set up in Supabase
EXPO_PUBLIC_LOYALTY_ENABLED=true                             # once the loyalty functions are deployed
```
All Shopify and AI API keys live only on the backend (Vercel env vars). Never put secrets in `EXPO_PUBLIC_` variables.

## Web preview (GitHub Pages)

```bash
scripts/deploy-web.sh
```
Builds a single-page web export (`experiments.baseUrl` is `/emis-plus-app`), copies `index.html` to `404.html` so deep links work, and adds one commit to the `gh-pages` branch. On the web, medical records use `lib/db.web.ts` (browser localStorage) because expo-sqlite needs cross-origin isolation headers that GitHub Pages cannot send.

## Backend Deployment

```bash
cd backend
npm install
vercel --prod
```

Set environment variables in Vercel dashboard:
- `SHOPIFY_ADMIN_TOKEN` - Shopify Admin API token (shpat_ prefix, server-side only)
- `SHOP_DOMAIN` - Shopify store domain (e.g. 4a6920-67.myshopify.com)
- `AI_API_KEY` - OpenRouter API key
- `AI_BASE_URL` - OpenRouter base URL (https://openrouter.ai/api/v1)
- `AI_MODEL` - AI model (e.g. openai/gpt-4o-mini)

Shopify order webhooks now go to the Supabase `shopify-webhook` function, not Vercel: see [docs/ACCOUNTS.md](docs/ACCOUNTS.md).

## App Store Submission

### iOS
1. Apple Developer Program account ($99/year)
2. `eas build --platform ios` (EAS Build)
3. Upload via Transporter or Xcode
4. App Store Connect review

### Android
1. Google Play Developer account ($25 one-time)
2. `eas build --platform android`
3. Upload AAB to Play Console

### Review Notes
- Medical tools are self-tracking only, not diagnostic
- All medical data stays on device (no HealthKit, no cloud sync)
- AI assistant is product selection only, not medical advice
- Physical goods checkout via Shopify (not IAP, so no 30% Apple cut)

## Project Structure

```
emis-app/
  app/
    (tabs)/          # 5 main tabs
      index.tsx      # Home
      shop.tsx       # Shop
      orders.tsx     # Orders
      tools.tsx      # Tools menu
      account.tsx    # Account
    tools/           # Individual medical tool screens
    product/[handle].tsx  # Product detail
    ai-assistant.tsx # AI chat
    _layout.tsx      # Root stack navigation
  lib/
    shopify.ts       # Shopify API client
    db.ts            # SQLite (medical data)
    supabase.ts      # Supabase client (Auth)
    auth/            # Sign-in steps (email code, Apple, Google) and session hook
    loyalty.ts       # Health Points API client
    ai.ts            # AI assistant
    export.ts        # CSV/export utilities
    types.ts         # TypeScript types
  backend/           # Vercel serverless functions
    api/
      ai/chat.ts
  supabase/          # Health Points: migration, edge functions, tests (run.sh)
```

## Privacy
- Medical tool data (wound, ostomy, vitals, etc.) is stored ONLY in local SQLite on the device
- No medical data is collected, uploaded, or synced to any server
- Device-to-device transfer uses local file sharing (AirDrop/email/messaging)
- Sign-in sessions stay on the device (AsyncStorage on native, browser storage on web); accounts live in Supabase Auth
- Health Points keep the user id, order IDs, order emails and amounts (Supabase, Singapore region)
