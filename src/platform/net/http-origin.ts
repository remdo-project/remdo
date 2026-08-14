// Whether a string is exactly a browser-reachable http(s) origin (scheme + host
// [+ port], no path/query/fragment). The strict form is used for canonical
// runtime and stored origins. User-pasted URLs use normalizeToHttpOrigin below.
export function isExactHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

// Reduces a user-supplied http(s) URL to its bare origin, or null if it is not a
// parseable http(s) URL. Accepts the browser-normal forms a strict isExactHttpOrigin
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
