// Trusted origins for Better Auth (the URLs from which mutating auth requests
// are accepted). This is a configuration concern — which URLs a deployment is
// reachable at — so it is derived here alongside APP_ORIGIN rather than computed
// inside the auth module.
//
// Production is restricted to the single configured public origin. Development
// additionally trusts the local aliases a developer reaches the app through,
// plus the loopback-only PWA preview origin.

interface DeriveAuthTrustedOriginsInput {
  baseURL: string;
  isProduction: boolean;
  /** Machine hostname for dev aliases; omit/empty to skip the hostname alias. */
  hostname?: string;
  /** Loopback-only PWA preview port. */
  previewPort?: number;
}

function appendOrigin(origins: string[], origin: string): void {
  if (!origins.includes(origin)) {
    origins.push(origin);
  }
}

function appendLocalDevAliases(
  origins: string[],
  protocol: string,
  port: string,
  hostname: string,
): void {
  appendOrigin(origins, `${protocol}//localhost:${port}`);
  appendOrigin(origins, `${protocol}//127.0.0.1:${port}`);
  if (hostname) {
    appendOrigin(origins, `${protocol}//${hostname}:${port}`);
  }
}

export function deriveAuthTrustedOrigins({
  baseURL,
  isProduction,
  hostname = '',
  previewPort,
}: DeriveAuthTrustedOriginsInput): string[] {
  if (baseURL.length === 0) {
    return [];
  }

  const url = new URL(baseURL);
  const origins = [url.origin];
  if (isProduction) {
    return origins;
  }

  const port = url.port;
  if (!port) {
    return origins;
  }

  appendLocalDevAliases(origins, url.protocol, port, hostname);
  const previewPortString = previewPort ? String(previewPort) : '';
  if (previewPortString && previewPortString !== port) {
    appendOrigin(origins, `${url.protocol}//localhost:${previewPortString}`);
    appendOrigin(origins, `${url.protocol}//127.0.0.1:${previewPortString}`);
  }
  return origins;
}
