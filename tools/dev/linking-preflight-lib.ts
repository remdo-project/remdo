export interface AuthorizationServerMetadata {
  authorization_endpoint?: unknown;
}

interface PublicSourceConfig {
  publicServer?: unknown;
}

type FetchSource = (url: URL, init: RequestInit) => Promise<Response>;

export async function fetchSourceJson<T>(
  url: URL,
  label: string,
  fetchSource: FetchSource = fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchSource(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(`${label} is not reachable at ${url}. Start pnpm dev first.`);
  }
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status} at ${url}.`);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error(`${label} returned invalid JSON at ${url}.`);
  }
}

export function assertPublicSourceConfig(sourceConfig: PublicSourceConfig): void {
  if (sourceConfig.publicServer !== true) {
    throw new Error('The running development source is private. Restart it with ALLOW_SIGNUP=true.');
  }
}

export function assertAuthorizationServerOrigin(
  metadata: AuthorizationServerMetadata,
  configuredUrl: string,
): void {
  if (typeof metadata.authorization_endpoint !== 'string') {
    throw new TypeError('Development source metadata does not advertise an authorization endpoint.');
  }
  const advertisedOrigin = new URL(metadata.authorization_endpoint).origin;
  const configuredOrigin = new URL(configuredUrl).origin;
  if (advertisedOrigin !== configuredOrigin) {
    throw new Error(
      `Development source advertises ${advertisedOrigin}, but current configuration resolves ${configuredOrigin}. Restart pnpm dev with the current .env.`,
    );
  }
}
