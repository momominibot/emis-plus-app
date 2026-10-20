// The signed-in customer's own orders, read from the Shopify Customer
// Account API with their access token. Nothing here can see other customers.

import { getDiscovery } from './auth/config';
import { NotSignedInError, customerApiRequest } from './auth/customerApi';
import { expireSession, getAccessToken } from './auth/session';

export { NotSignedInError };

export interface CustomerOrder {
  id: string;
  name: string;
  processedAt: string;
  financialStatus: string | null;
  fulfillmentStatus: string;
  shipmentStatus: string | null;
  cancelled: boolean;
  total: { amount: string; currencyCode: string };
  statusPageUrl: string;
  items: { title: string; quantity: number; image?: string }[];
  tracking: { number: string | null; company: string | null; url: string | null }[];
}

export const ORDERS_QUERY = `query EmisOrders($first: Int!, $after: String) {
  customer {
    orders(first: $first, after: $after, sortKey: PROCESSED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        processedAt
        financialStatus
        fulfillmentStatus
        cancelledAt
        statusPageUrl
        totalPrice { amount currencyCode }
        lineItems(first: 4) { nodes { title quantity image { url } } }
        fulfillments(first: 5) { nodes { latestShipmentStatus trackingInformation { number company url } } }
      }
    }
  }
}`;

type OrderNode = {
  id: string;
  name: string;
  processedAt: string;
  financialStatus: string | null;
  fulfillmentStatus: string;
  cancelledAt: string | null;
  statusPageUrl: string;
  totalPrice: { amount: string; currencyCode: string };
  lineItems: { nodes: { title: string; quantity: number; image: { url: string } | null }[] };
  fulfillments: { nodes: { latestShipmentStatus: string | null; trackingInformation: { number: string | null; company: string | null; url: string | null }[] }[] };
};

/**
 * One status for the whole order, never more advanced than its least
 * advanced parcel: two parcels, one delivered and one on the way, is
 * "Partly delivered", not "Delivered".
 */
export function overallShipmentStatus(fulfillmentStatus: string, shipments: (string | null)[]): string | null {
  const known = shipments.filter((x): x is string => !!x);
  if (!known.length) return null;
  const delivered = known.filter((x) => x === 'DELIVERED').length;
  if (delivered === shipments.length && fulfillmentStatus === 'FULFILLED') return 'DELIVERED';
  if (delivered > 0) return 'PARTLY_DELIVERED';
  return known.find((x) => x !== 'DELIVERED') || null;
}

export function mapOrder(n: OrderNode): CustomerOrder {
  const fulfillments = n.fulfillments?.nodes || [];
  return {
    id: n.id,
    name: n.name,
    processedAt: n.processedAt,
    financialStatus: n.financialStatus,
    fulfillmentStatus: n.fulfillmentStatus,
    shipmentStatus: overallShipmentStatus(n.fulfillmentStatus, fulfillments.map((f) => f.latestShipmentStatus)),
    cancelled: !!n.cancelledAt,
    total: n.totalPrice,
    statusPageUrl: n.statusPageUrl,
    items: (n.lineItems?.nodes || []).map((li) => ({ title: li.title, quantity: li.quantity, image: li.image?.url })),
    tracking: fulfillments.flatMap((f) => f.trackingInformation || []),
  };
}

export interface OrdersPage {
  orders: CustomerOrder[];
  nextCursor: string | null;
}

/** Newest first, `first` at a time; pass the previous page's nextCursor for older orders. */
export async function fetchOrders(after: string | null = null, first = 20): Promise<OrdersPage> {
  const token = await getAccessToken();
  if (!token) throw new NotSignedInError();
  const { graphqlApi } = await getDiscovery();
  try {
    const data = await customerApiRequest<{
      customer: { orders: { nodes: OrderNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
    }>(graphqlApi, token, ORDERS_QUERY, { first, after });
    const conn = data.customer?.orders;
    return {
      orders: (conn?.nodes || []).map(mapOrder),
      nextCursor: conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null,
    };
  } catch (err) {
    if (err instanceof NotSignedInError) await expireSession(token);
    throw err;
  }
}

/** Plain-language status for an order card. */
export function orderStatusLabel(o: CustomerOrder): string {
  if (o.cancelled) return 'Cancelled';
  if (o.financialStatus === 'REFUNDED') return 'Refunded';
  switch (o.shipmentStatus) {
    case 'DELIVERED': return 'Delivered';
    case 'PARTLY_DELIVERED': return 'Partly delivered';
    case 'OUT_FOR_DELIVERY': return 'Out for delivery';
    case 'IN_TRANSIT':
    case 'CARRIER_PICKED_UP': return 'On the way';
    case 'DELAYED': return 'Delayed';
    case 'PICKED_UP': return 'Picked up';
    case 'READY_FOR_PICKUP': return 'Ready for pickup';
    case 'ATTEMPTED_DELIVERY': return 'Delivery attempted';
    case 'FAILURE': return 'Delivery problem';
  }
  switch (o.fulfillmentStatus) {
    case 'FULFILLED': return 'Shipped';
    case 'PARTIALLY_FULFILLED': return 'Partly shipped';
    case 'ON_HOLD': return 'On hold';
  }
  if (o.financialStatus === 'PENDING' || o.financialStatus === 'AUTHORIZED') return 'Awaiting payment';
  return 'Processing';
}
