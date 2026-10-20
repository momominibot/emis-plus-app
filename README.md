# EMIS+ Mobile App

A cross-platform mobile app for emis.asia - essential medical supplies store in Singapore.

## Features

### 5 Tabs
1. **Home** - Health points balance, tier badge, vouchers, promotions carousel, new arrivals, AI assistant entry
2. **Shop** - Category browsing, product search, product grid, synced to Shopify
3. **Orders** - Order history with fulfillment status and tracking numbers
4. **Tools** - Local-only medical tools (never uploaded):
   - Compression stocking measurement calculator
   - Wound tracker with measurements
   - Ostomy output log
   - Intake & output chart
   - Vitals monitor (BP, HR, temp, SpO2, blood sugar, weight)
   - Export to doctor (CSV/summary) and device-to-device transfer
5. **Account** - Member tier (Silver/Gold/Diamond), points history, referral code, vouchers, settings

### AI Product Assistant
- Chat-based product selection helper
- Strict boundary: product recommendations only, never medical diagnosis
- Quick prompts for common questions

### Loyalty System
- Silver (1x points), Gold (1.5x, $500 min), Diamond (2x, $2000 min)
- Points earn on purchases, burn for vouchers
- Referral code system - both parties get bonus points
- Tier-specific perks

## Tech Stack
- **Frontend**: React Native + Expo SDK 57 + Expo Router (TypeScript)
- **Commerce**: Shopify Admin API (products, collections, orders)
- **Local Storage**: expo-sqlite (medical data, 100% on-device)
- **Backend**: Vercel serverless functions (AI proxy, loyalty, Shopify webhooks)
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
Create `.env` in the app root:
```
EXPO_PUBLIC_SHOPIFY_ADMIN_TOKEN=shpat_xxx
EXPO_PUBLIC_SHOP_DOMAIN=4a6920-67.myshopify.com
EXPO_PUBLIC_BACKEND_URL=https://your-backend.vercel.app
```

## Backend Deployment

```bash
cd backend
npm install
vercel --prod
```

Set environment variables in Vercel dashboard:
- `SHOPIFY_ADMIN_TOKEN` - Shopify Admin API token
- `SHOPIFY_WEBHOOK_SECRET` - Webhook signing secret
- `AI_API_KEY` - Volcengine Ark API key
- `LOYALTY_DB_URL` - Database connection (Postgres/Supabase)

### Shopify Webhook Setup
1. Go to Shopify Admin > Settings > Notifications > Webhooks
2. Create webhook: Event = "Order payment", URL = `https://your-backend.vercel.app/api/webhooks/shopify`
3. Copy the webhook secret to `SHOPIFY_WEBHOOK_SECRET`

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
    loyalty.ts       # Points, tiers, referral
    ai.ts            # AI assistant
    export.ts        # CSV/export utilities
    types.ts         # TypeScript types
  backend/           # Vercel serverless functions
    api/
      ai/chat.ts
      loyalty/points.ts
      loyalty/referral.ts
      webhooks/shopify.ts
```

## Privacy
- Medical tool data (wound, ostomy, vitals, etc.) is stored ONLY in local SQLite on the device
- No medical data is collected, uploaded, or synced to any server
- Device-to-device transfer uses local file sharing (AirDrop/email/messaging)
- Customer account data (points, orders) is managed via Shopify + backend
