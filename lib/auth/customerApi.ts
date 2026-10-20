// Minimal Customer Account API GraphQL client. The token is the signed-in
// customer's own access token; it can only read that customer's data.

export class NotSignedInError extends Error {
  constructor() {
    super('Please sign in again.');
  }
}

export async function customerApiRequest<T>(
  endpoint: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401 || res.status === 403) throw new NotSignedInError();
  if (!res.ok) throw new Error('Could not reach your emis.asia account (HTTP ' + res.status + ')');
  const json = await res.json();
  if (json.errors && json.errors.length) {
    const codes: unknown[] = json.errors.map((e: { extensions?: { code?: string } }) => e.extensions?.code);
    if (codes.includes('UNAUTHENTICATED') || codes.includes('ACCESS_DENIED')) throw new NotSignedInError();
    throw new Error(json.errors.map((e: { message?: string }) => e.message).join('; '));
  }
  return json.data as T;
}

export const CUSTOMER_SUMMARY_QUERY = 'query EmisCustomer { customer { id firstName emailAddress { emailAddress } } }';

export async function fetchCustomerSummary(endpoint: string, token: string) {
  const data = await customerApiRequest<{
    customer: { id: string; firstName: string | null; emailAddress: { emailAddress: string | null } | null };
  }>(endpoint, token, CUSTOMER_SUMMARY_QUERY);
  return {
    id: data.customer.id,
    firstName: data.customer.firstName || null,
    email: data.customer.emailAddress?.emailAddress || null,
  };
}
