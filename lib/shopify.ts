// Shopify Storefront API, tokenless access.
//
// Shopify lets a storefront read products, collections, search, pages, blogs
// and articles with no access token at all (query complexity limit 1,000).
// That means the app needs no secret: nothing in this file can be abused to
// read customers, orders or change the store. Prices and stock come straight
// from Shopify, never from the app.
//
// Docs: https://shopify.dev/docs/api/storefront (Authentication > Tokenless access)

import { Product, Collection } from './types';
import { getCategory, fallbackUrl } from './clinical/recommendations';

const SHOP_DOMAIN = process.env.EXPO_PUBLIC_SHOP_DOMAIN || '4a6920-67.myshopify.com';
const API_VERSION = '2026-10';
const STOREFRONT_URL = 'https://' + SHOP_DOMAIN + '/api/' + API_VERSION + '/graphql.json';

export const STORE_URL = 'https://www.emis.asia';

async function storefrontQuery<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(STOREFRONT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error('Could not reach the EMIS+ store (HTTP ' + res.status + ')');
  }
  const json = await res.json();
  if (json.errors && json.errors.length) {
    throw new Error(json.errors.map(function(e: any) { return e.message; }).join('; '));
  }
  return json.data as T;
}

const PRODUCT_FIELDS = [
  'id',
  'title',
  'description',
  'handle',
  'vendor',
  'tags',
  'availableForSale',
  'onlineStoreUrl',
  'featuredImage { url }',
  'variants(first: 1) { edges { node { price { amount } compareAtPrice { amount } } } }',
].join('\n');

function money(amount: string | undefined | null): string | undefined {
  if (amount == null) return undefined;
  const n = Number(amount);
  return Number.isFinite(n) ? n.toFixed(2) : undefined;
}

function mapProduct(node: any): Product {
  const variant = node.variants && node.variants.edges && node.variants.edges[0] && node.variants.edges[0].node;
  return {
    id: node.id,
    title: node.title,
    description: node.description || '',
    handle: node.handle,
    vendor: node.vendor,
    tags: node.tags || [],
    image: node.featuredImage ? node.featuredImage.url : undefined,
    price: money(variant && variant.price && variant.price.amount) || '0.00',
    compareAtPrice: money(variant && variant.compareAtPrice && variant.compareAtPrice.amount),
    available: node.availableForSale !== false,
    url: node.onlineStoreUrl || STORE_URL + '/products/' + node.handle,
  };
}

// Shop categories, curated to live emis.asia collections that hold products.
// Checked against the Storefront API on 20 October 2026.
export const SHOP_CATEGORIES: Collection[] = [
  { id: 'wound', title: 'Wound care', handle: 'wound-care-supplies-singapore' },
  { id: 'advanced', title: 'Advanced dressings', handle: 'advanced-wound-care' },
  { id: 'ostomy', title: 'Ostomy', handle: 'ostomy-products' },
  { id: 'ostomy-acc', title: 'Ostomy accessories', handle: 'ostomy-accessories' },
  { id: 'compression', title: 'Compression', handle: 'compression-stocking' },
  { id: 'skin', title: 'Skin protection', handle: 'wound-care-accessories-skin-protection' },
  { id: 'hygiene', title: 'Hygiene', handle: 'hygiene-and-infection-control' },
  { id: 'supplements', title: 'Supplements', handle: 'health-supplement' },
];

export async function getCollections(): Promise<Collection[]> {
  return SHOP_CATEGORIES;
}

export async function getProducts(collectionHandle?: string): Promise<Product[]> {
  if (collectionHandle) {
    const data = await storefrontQuery<{ collection: any }>(
      'query CollectionProducts($handle: String!) { collection(handle: $handle) { products(first: 50) { edges { node { ' + PRODUCT_FIELDS + ' } } } } }',
      { handle: collectionHandle }
    );
    const edges = (data.collection && data.collection.products && data.collection.products.edges) || [];
    return edges.map(function(e: any) { return mapProduct(e.node); });
  }
  const dataAll = await storefrontQuery<{ products: any }>(
    'query Products { products(first: 50, sortKey: BEST_SELLING) { edges { node { ' + PRODUCT_FIELDS + ' } } } }'
  );
  return dataAll.products.edges.map(function(e: any) { return mapProduct(e.node); });
}

export async function getProductByHandle(handle: string): Promise<Product | null> {
  const data = await storefrontQuery<{ product: any }>(
    'query Product($handle: String!) { product(handle: $handle) { ' + PRODUCT_FIELDS + ' descriptionHtml images(first: 6) { edges { node { url } } } } }',
    { handle }
  );
  if (!data.product) return null;
  const p = mapProduct(data.product);
  p.descriptionHtml = data.product.descriptionHtml || '';
  const imgs = ((data.product.images && data.product.images.edges) || []).map(function(e: any) { return e.node.url; });
  p.images = imgs.length ? imgs : (p.image ? [p.image] : []);
  return p;
}

export async function getNewProducts(limit = 8): Promise<Product[]> {
  const data = await storefrontQuery<{ products: any }>(
    'query NewProducts($limit: Int!) { products(first: $limit, sortKey: CREATED_AT, reverse: true) { edges { node { ' + PRODUCT_FIELDS + ' } } } }',
    { limit }
  );
  return data.products.edges.map(function(e: any) { return mapProduct(e.node); });
}

export async function searchProducts(query: string, limit = 20): Promise<Product[]> {
  const data = await storefrontQuery<{ products: any }>(
    'query Search($query: String!, $limit: Int!) { products(first: $limit, query: $query) { edges { node { ' + PRODUCT_FIELDS + ' } } } }',
    { query, limit }
  );
  return data.products.edges.map(function(e: any) { return mapProduct(e.node); });
}

// Products for a clinical recommendation tag (wound advisor, skin check,
// nutrition). Curated collection first, topped up by search, in stock only.
export async function getProductsForTag(tag: string, limit = 6): Promise<{ heading: string; products: Product[]; moreUrl: string } | null> {
  const category = getCategory(tag);
  if (!category) return null;
  const seen = new Set<string>();
  const out: Product[] = [];
  function add(list: Product[]) {
    for (const p of list) {
      if (out.length >= limit) return;
      if (!p.available || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  if (category.collectionHandle) {
    try { add(await getProducts(category.collectionHandle)); } catch { /* fall through to search */ }
  }
  if (out.length < limit && category.query) {
    try { add(await searchProducts(category.query, limit * 2)); } catch { /* show link only */ }
  }
  return { heading: category.heading, products: out, moreUrl: fallbackUrl(category) };
}

// --- Education: emis.asia blog articles ---

export interface BlogArticle {
  id: string;
  title: string;
  handle: string;
  excerpt: string;
  image?: string;
  publishedAt: string;
  url: string;
}

export const EDUCATION_BLOGS = [
  { handle: 'top-tips-for-effective-wound-care-dressings', title: 'Wound care tips' },
  { handle: 'stoma-ostomy-care', title: 'Stoma & ostomy tips' },
];

export async function getBlogArticles(blogHandle: string, limit = 10): Promise<BlogArticle[]> {
  const data = await storefrontQuery<{ blog: any }>(
    'query Blog($handle: String!, $limit: Int!) { blog(handle: $handle) { articles(first: $limit, sortKey: PUBLISHED_AT, reverse: true) { edges { node { id title handle excerpt publishedAt onlineStoreUrl image { url } } } } } }',
    { handle: blogHandle, limit }
  );
  const edges = (data.blog && data.blog.articles && data.blog.articles.edges) || [];
  return edges.map(function(e: any) {
    const a = e.node;
    return {
      id: a.id,
      title: a.title,
      handle: a.handle,
      excerpt: (a.excerpt || '').replace(/\s+/g, ' ').trim(),
      image: a.image ? a.image.url : undefined,
      publishedAt: a.publishedAt,
      url: a.onlineStoreUrl || STORE_URL + '/blogs/' + blogHandle + '/' + a.handle,
    };
  });
}
