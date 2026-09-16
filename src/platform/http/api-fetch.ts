let csrfCookieName: string | null = null;

export function setCsrfCookieName(name: string): void {
  csrfCookieName = name;
}

/** Same-origin session mutations use Django's CSRF cookie, namespaced by canonical port. */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? new URL(input, typeof location === 'undefined' ? undefined : location.href) : input;
  const request = new Request(url, { credentials: 'same-origin', ...init });
  if (typeof document !== 'undefined' && csrfCookieName && new URL(request.url).origin === location.origin && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const cookieName = `${csrfCookieName}=`;
    const cookie = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(cookieName));
    if (cookie) {
      request.headers.set('X-CSRFToken', decodeURIComponent(cookie.slice(cookieName.length)));
    }
  }
  return fetch(request);
}
