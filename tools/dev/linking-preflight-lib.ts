interface AuthorizationServerMetadata {
  authorization_endpoint?: unknown;
}

interface PublicSourceConfig {
  publicServer?: unknown;
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
