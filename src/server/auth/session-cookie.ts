const SESSION_COOKIE_PATTERN = /((?:__Secure-)?better-auth\.session_token)=([^;]+)/u;

/**
 * Extracts the Better Auth session cookie (name=value) from a sign-in
 * response, tolerating the `__Secure-` prefix used over HTTPS.
 */
export function extractSessionCookie(response: Response): string {
  const extendedHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const getSetCookie = typeof extendedHeaders.getSetCookie === 'function' ? extendedHeaders.getSetCookie() : [];
  const header = getSetCookie[0] ?? response.headers.get('set-cookie') ?? '';
  const match = header.match(SESSION_COOKIE_PATTERN);
  if (!match) {
    throw new Error('Better Auth session cookie missing from response.');
  }
  return `${match[1]}=${match[2]}`;
}
