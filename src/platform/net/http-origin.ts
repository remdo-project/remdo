// Whether a string is exactly a browser-reachable http(s) origin (scheme + host
// [+ port], no path/query/fragment). The strict form, used server-side to derive
// and validate stored source ids/origins (see remdo-oauth/config.ts). Rejects
// non-http schemes like `ws:`/`ftp:` even though their `URL.origin` can equal the
// input. (For a user-pasted URL the lenient normalizeToHttpOrigin below is the
// front door — see source-links.ts.)
export function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

// Reduces a user-supplied http(s) URL to its bare origin, or null if it is not a
// parseable http(s) URL. Accepts the browser-normal forms a strict isHttpOrigin
// check rejects (a trailing slash, a path/query/fragment) by discarding
// everything past the origin — a source is identified by origin. Non-http
// schemes and unparseable input return null.
export function normalizeToHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}
