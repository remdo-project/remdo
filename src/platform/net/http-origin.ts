// Whether a string is exactly a browser-reachable http(s) origin (scheme + host
// [+ port], no path/query/fragment). Shared by the client and server sides of the
// source-registration flow so the two validations cannot drift. Rejects non-http
// schemes like `ws:`/`ftp:` even though their `URL.origin` can equal the input.
export function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}
