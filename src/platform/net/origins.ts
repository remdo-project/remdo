import { config } from '#config';
import { resolveLoopbackHost } from './loopback';

export const INTERNAL_SERVICE_HOST = '127.0.0.1';

function createHttpOrigin(host: string, port: number): string {
  const urlHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `http://${urlHost}:${port}`;
}

export function resolveAppOrigin(): string {
  return createHttpOrigin(resolveLoopbackHost(config.env.HOST), config.env.PORT);
}

export function resolveApiServerOrigin(): string {
  return createHttpOrigin(INTERNAL_SERVICE_HOST, config.env.API_SERVER_PORT);
}

export function resolveCollabServerOrigin(): string {
  return createHttpOrigin(INTERNAL_SERVICE_HOST, config.env.COLLAB_SERVER_PORT);
}
