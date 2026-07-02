import { Buffer } from 'node:buffer';

// A source server's identity, as it appears to the home. Credentials live
// separately (see StoredSourceServer) because a source exists in the home's
// admin-managed list before it is registered and issued OAuth credentials.
export interface LinkableRemdoServer {
  id: string;
  label: string;
  baseUrl: string;
}

// Turns a source origin into a stable, URL-safe id usable as the Better Auth
// providerId, the account-link key, and a callback URL path segment. base64url of
// the full origin is reversible, so distinct origins always map to distinct ids
// (a slug that collapsed punctuation would alias e.g. `foo-bar.example` and
// `foo.bar.example`).
export function deriveSourceId(origin: string): string {
  return Buffer.from(origin, 'utf8').toString('base64url');
}

// Derives a source server entry from a bare-origin URL. Throws on a URL that is
// not exactly an origin (it carries a path, query, etc.) or is unparseable.
export function deriveSourceServer(value: string): LinkableRemdoServer {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Source server must be a valid URL origin: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Source server must be an http(s) URL origin: ${value}`);
  }
  if (value !== url.origin) {
    throw new Error(`Source server must exactly match a URL origin: ${value}`);
  }
  return {
    id: deriveSourceId(url.origin),
    label: url.host,
    baseUrl: url.origin,
  };
}
