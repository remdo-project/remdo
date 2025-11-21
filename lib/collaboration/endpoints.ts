export interface ResolvedEndpoints {
  auth: string;
  create: string;
}

export type EndpointResolver = (docId: string) => ResolvedEndpoints;

function normalizeBase(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

/**
 * Builds an endpoint resolver from a base URL that points at the collab doc root.
 * The base should include the `/doc` segment (e.g. `/doc` or `http://host:port/doc`).
 * The resolver encodes document ids to keep paths safe.
 */
export function buildCollabEndpointsFromBase(base: string): EndpointResolver {
  const normalizedBase = normalizeBase(base);

  return (docId: string) => {
    const encodedId = encodeURIComponent(docId);
    return {
      auth: `${normalizedBase}/${encodedId}/auth`,
      create: `${normalizedBase}/new`,
    };
  };
}
