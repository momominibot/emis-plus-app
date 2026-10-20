import { Product, Collection, Order } from './types';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://backend-theta-ashen-89.vercel.app';
const SHOPIFY_PROXY = BACKEND_URL + '/api/shopify';

async function adminQuery<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(SHOPIFY_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error('Shopify proxy error: HTTP ' + res.status);
  }
  const json = await res.json();
  if (json.errors && json.errors.length) {
    throw new Error(json.errors.map(function(e: any) { return e.message; }).join('; '));
  }
  return json.data as T;
}

var PRODUCT_FIELDS = [
  'id',
  'title',
  'description',
  'handle',
  'vendor',
  'tags',
  'featuredImage { url }',
  'variants(first: 1) {',
  '  edges {',
  '    node {',
  '      price { amount }',
  '      compareAtPrice { amount }',
  '    }',
  '  }',
  '}',
].join('\n');

function mapProduct(node: any): Product {
  var variant = node.variants && node.variants.edges && node.variants.edges[0] && node.variants.edges[0].node;
  return {
    id: node.id,
    title: node.title,
    description: (node.description && node.description.substring(0, 200)) || '',
    handle: node.handle,
    vendor: node.vendor,
    tags: node.tags || [],
    image: node.featuredImage && node.featuredImage.url,
    price: (variant && variant.price && variant.price.amount) || '0',
    compareAtPrice: (variant && variant.compareAtPrice && variant.compareAtPrice.amount) || undefined,
  };
}

export async function getCollections(): Promise<Collection[]> {
  var data = await adminQuery<{ collections: any }>(
    'query GetCollections { collections(first: 20, query: "-title:Home page") { edges { node { id title handle image { url } } } } }'
  );
  return data.collections.edges.map(function(e: any) {
    return {
      id: e.node.id,
      title: e.node.title,
      handle: e.node.handle,
      image: e.node.image && e.node.image.url,
      productCount: 0,
    };
  });
}

export async function getProducts(collectionHandle?: string): Promise<Product[]> {
  if (collectionHandle) {
    var data = await adminQuery<{ collectionByHandle: any }>(
      'query GetCollectionProducts($handle: String!) { collectionByHandle(handle: $handle) { products(first: 50) { edges { node { ' + PRODUCT_FIELDS + ' } } } } }',
      { handle: collectionHandle }
    );
    var edges = (data.collectionByHandle && data.collectionByHandle.products && data.collectionByHandle.products.edges) || [];
    return edges.map(function(e: any) { return mapProduct(e.node); });
  }
  var dataAll = await adminQuery<{ products: any }>(
    'query GetProducts { products(first: 50, sortKey: UPDATED_AT, reverse: true) { edges { node { ' + PRODUCT_FIELDS + ' } } } }'
  );
  return dataAll.products.edges.map(function(e: any) { return mapProduct(e.node); });
}

export async function getProductByHandle(handle: string): Promise<Product | null> {
  var data = await adminQuery<{ productByHandle: any }>(
    'query GetProduct($handle: String!) { productByHandle(handle: $handle) { ' + PRODUCT_FIELDS + ' } }',
    { handle }
  );
  return data.productByHandle ? mapProduct(data.productByHandle) : null;
}

export async function getNewProducts(limit = 8): Promise<Product[]> {
  var data = await adminQuery<{ products: any }>(
    'query GetNewProducts($limit: Int!) { products(first: $limit, sortKey: UPDATED_AT, reverse: true) { edges { node { ' + PRODUCT_FIELDS + ' } } } }',
    { limit }
  );
  return data.products.edges.map(function(e: any) { return mapProduct(e.node); });
}

export async function getCustomerOrders(customerId: string): Promise<Order[]> {
  var query = [
    'query GetCustomerOrders($customerId: ID!) {',
    '  customer(id: $customerId) {',
    '    orders(first: 20, reverse: true) {',
    '      edges {',
    '        node {',
    '          id name createdAt displayFinancialStatus displayFulfillmentStatus',
    '          totalPriceSet { shopMoney { amount } }',
    '          lineItems(first: 10) { edges { node { title quantity } } }',
    '          fulfillments(first: 5) { trackingInfo { number company } }',
    '        }',
    '      }',
    '    }',
    '  }',
    '}',
  ].join('\n');
  var data = await adminQuery<{ customer: any }>(query, { customerId: customerId });
  var edges = (data.customer && data.customer.orders && data.customer.orders.edges) || [];
  return edges.map(function(e: any) {
    var o = e.node;
    var fulfillment = o.fulfillments && o.fulfillments[0];
    var tracking = fulfillment && fulfillment.trackingInfo && fulfillment.trackingInfo[0];
    var fulfillStatus = o.displayFulfillmentStatus;
    var status: Order['status'] = 'pending';
    if (fulfillStatus === 'FULFILLED') status = 'delivered';
    else if (fulfillStatus === 'PARTIAL') status = 'shipped';
    else if (o.displayFinancialStatus === 'PAID') status = 'paid';
    return {
      id: o.id,
      orderNumber: o.name,
      date: o.createdAt,
      status: status,
      trackingNumber: tracking && tracking.number,
      trackingCompany: tracking && tracking.company,
      total: (o.totalPriceSet && o.totalPriceSet.shopMoney && o.totalPriceSet.shopMoney.amount) || '0',
      items: o.lineItems.edges.map(function(li: any) {
        return { title: li.node.title, quantity: li.node.quantity };
      }),
    };
  });
}

export async function searchProducts(query: string): Promise<Product[]> {
  var data = await adminQuery<{ products: any }>(
    'query SearchProducts($query: String!) { products(first: 20, query: $query) { edges { node { ' + PRODUCT_FIELDS + ' } } } }',
    { query: query }
  );
  return data.products.edges.map(function(e: any) { return mapProduct(e.node); });
}
