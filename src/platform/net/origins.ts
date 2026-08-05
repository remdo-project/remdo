import { config } from '#config';

export const INTERNAL_SERVICE_HOST = '127.0.0.1';

function createHttpOrigin(host: string, port: number): string {
  return `http://${host}:${port}`;
}

export function resolveLocalGatewayOrigin(): string {
  const host = config.env.HOST === '0.0.0.0' ? INTERNAL_SERVICE_HOST : config.env.HOST;
  return createHttpOrigin(host, config.env.PORT);
}

export function resolveApiServerOrigin(): string {
  return createHttpOrigin(INTERNAL_SERVICE_HOST, config.env.API_SERVER_PORT);
}

export function resolveCollabServerOrigin(): string {
  return createHttpOrigin(INTERNAL_SERVICE_HOST, config.env.COLLAB_SERVER_PORT);
}
