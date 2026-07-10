import { Buffer } from 'node:buffer';
import { isHttpOrigin } from '#platform/net/http-origin';

// A source server's identity, as it appears to the home. Credentials live
// separately (see StoredSourceServer) because a source row exists in the home's
// origin-keyed cache from first link, before self-registration fills its
// public client_id.
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

export function decodeSourceId(id: string): string | null {
  const origin = Buffer.from(id, 'base64url').toString('utf8');
  return isHttpOrigin(origin) && deriveSourceId(origin) === id ? origin : null;
}

// The source's display label is just its host — derived from the origin, never
// stored or configured. Single source of that rule so the store and the add path
// agree.
export function deriveSourceLabel(origin: string): string {
  return new URL(origin).host;
}

// Derives a source server entry from a bare http(s) origin. Throws on anything
// that is not exactly an origin (wrong scheme, or carrying a path/query/etc.).
export function deriveSourceServer(value: string): LinkableRemdoServer {
  if (!isHttpOrigin(value)) {
    throw new Error(`Source server must be a bare http(s) origin (e.g. https://remdo.com), got: ${value}`);
  }
  const url = new URL(value);
  return {
    id: deriveSourceId(url.origin),
    label: deriveSourceLabel(url.origin),
    baseUrl: url.origin,
  };
}
