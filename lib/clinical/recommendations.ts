/**
 * Maps clinical recommendation tags to emis.asia products.
 *
 * Preference order:
 *  1. A curated Shopify collection (most stable — survives catalog/search changes).
 *  2. A Storefront search query (fallback when no clean collection exists).
 *
 * Collection handles below are real emis.asia collections (verified against the
 * live Storefront API). The store-search/collection fallback URL is always set so
 * the UI has a useful link even when the API returns nothing.
 */

export interface ProductCategory {
  tag: string;
  /** Friendly heading shown above the product cards. */
  heading: string;
  /** Preferred: pull products from this emis.asia collection handle. */
  collectionHandle?: string;
  /** Fallback: Storefront search query (Shopify search syntax). */
  query?: string;
  /** Public emis.asia URL used when the API is unavailable or empty. */
  fallbackPath: string;
}

const STORE = "https://emis.asia";

const CATEGORIES: Record<string, ProductCategory> = {
  // Wound calculator — emis.asia has no dedicated arginine/Vit C/zinc product on the
  // headless channel, so we search broadly across supplements rather than mis-map.
  "wound-supplements": {
    tag: "wound-supplements",
    heading: "Nutrition supplements at emis.asia",
    query: "vitamin OR zinc OR mineral OR collagen OR protein OR supplement",
    fallbackPath: "/search?q=supplement",
  },
  "oral-rehydration": {
    tag: "oral-rehydration",
    heading: "Electrolyte / rehydration",
    query: "electrolyte powder hydration",
    fallbackPath: "/collections/dr-berg-supplement",
  },
  "ostomy-supplies": {
    tag: "ostomy-supplies",
    heading: "Ostomy supplies",
    collectionHandle: "stoma-products",
    fallbackPath: "/collections/stoma-products",
  },
  "barrier-accessories": {
    tag: "barrier-accessories",
    heading: "Skin barrier accessories",
    collectionHandle: "ostomy-accessories",
    fallbackPath: "/collections/ostomy-accessories",
  },
  "peristomal-skin-care": {
    tag: "peristomal-skin-care",
    heading: "Barrier creams & skin protection",
    collectionHandle: "skins-moisturizer-build-barrier-skin",
    fallbackPath: "/collections/skins-moisturizer-build-barrier-skin",
  },

  // --- Wound Product Advisor categories (emis.asia Advanced Wound Care) ---
  // Each has a curated collection PLUS a `query` backfill: several of these
  // collections are under-curated (e.g. "Hydrocolloid & Hydrogel" held only the
  // DuoDERM gels, not the hydrocolloid sheets), so /api/products tops a thin
  // collection up with matching products found by search.
  "wound-cleansing": {
    tag: "wound-cleansing",
    heading: "Wound cleansing & basics",
    collectionHandle: "cleansing-antiseptic-solution",
    query: "wound cleanser OR saline OR wound wash OR irrigation",
    fallbackPath: "/collections/cleansing-antiseptic-solution",
  },
  "wound-nonadherent": {
    tag: "wound-nonadherent",
    heading: "Non-adherent contact layers & pads",
    collectionHandle: "absorbent-pads-non-adherent-dressings",
    query:
      "non-adherent OR contact layer OR silicone dressing OR absorbent pad OR mepitel OR adaptic OR atrauman",
    fallbackPath: "/collections/absorbent-pads-non-adherent-dressings",
  },
  "wound-hydrocolloid-hydrogel": {
    tag: "wound-hydrocolloid-hydrogel",
    heading: "Hydrocolloid & hydrogel dressings",
    // Store split these into two collections; hydrocolloid holds the DuoDERM
    // sheets (the substantive set). The query backfill pulls in the hydrogels too.
    collectionHandle: "hydrocolloid-dressings",
    query: "hydrocolloid OR hydrogel OR duoderm OR comfeel OR granuflex",
    fallbackPath: "/collections/hydrocolloid-dressings",
  },
  "wound-foam": {
    tag: "wound-foam",
    heading: "Foam dressings",
    collectionHandle: "foam-dressing",
    query: "foam dressing OR mepilex OR allevyn OR biatain OR aquacel foam",
    fallbackPath: "/collections/foam-dressing",
  },
  "wound-alginate": {
    tag: "wound-alginate",
    heading: "Alginate & gelling-fibre dressings",
    collectionHandle: "alginate-dressings",
    query: "alginate OR gelling fibre OR hydrofiber OR aquacel OR kaltostat OR sorbsan",
    fallbackPath: "/collections/alginate-dressings",
  },
  "wound-antimicrobial": {
    tag: "wound-antimicrobial",
    // Store now splits these into 3 collections (silver / cadexomer iodine /
    // honey), so span all of them with a search rather than one collection.
    heading: "Antimicrobial dressings (silver, iodine, honey)",
    query:
      "silver dressing OR aquacel ag OR cadexomer OR iodine OR medical honey OR manuka OR PHMB",
    fallbackPath: "/collections/silver-dressings",
  },
  "wound-npwt": {
    tag: "wound-npwt",
    heading: "Negative pressure wound therapy",
    collectionHandle: "negative-pressure-wound-therapy-npwt",
    query: "negative pressure OR NPWT OR wound vac OR PICO",
    fallbackPath: "/collections/negative-pressure-wound-therapy-npwt",
  },
};

export function getCategory(tag: string): ProductCategory | undefined {
  return CATEGORIES[tag];
}

export function fallbackUrl(category: ProductCategory): string {
  return `${STORE}${category.fallbackPath}`;
}

export function allCategories(): ProductCategory[] {
  return Object.values(CATEGORIES);
}
