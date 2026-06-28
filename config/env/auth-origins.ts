// Trusted origins for Better Auth (the URLs from which mutating auth requests
// are accepted). This is a configuration concern — which URLs a deployment is
// reachable at — so it is derived here alongside AUTH_URL rather than computed
// inside the auth module.
//
// Production is restricted to the single configured public origin. Development
// additionally trusts the local aliases a developer reaches the app through:
// localhost / 127.0.0.1 / the machine hostname, for both the dev app port and
// the `vite preview` port (the prod bundle preview serves from PREVIEW_PORT,
// not the dev port the auth baseURL is derived from).

interface DeriveAuthTrustedOriginsInput {
  baseURL: string;
  isProduction: boolean;
  /** Machine hostname for dev aliases; omit/empty to skip the hostname alias. */
  hostname?: string;
  /** `vite preview` app port; trusted in dev when it differs from the app port. */
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

  if (previewPort && String(previewPort) !== port) {
    appendLocalDevAliases(origins, url.protocol, String(previewPort), hostname);
  }
  return origins;
}
