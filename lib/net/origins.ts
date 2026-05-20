import { config } from '../../config';
import { resolveLoopbackHost } from './loopback';

interface BindOriginOptions {
  loopback?: boolean;
}

function resolveOriginHost({ loopback = false }: BindOriginOptions = {}): string {
  return loopback ? resolveLoopbackHost(config.env.HOST) : config.env.HOST;
}

function createHttpOrigin(port: number, options?: BindOriginOptions): string {
  return `http://${resolveOriginHost(options)}:${port}`;
}

export function resolveAppOrigin(options?: BindOriginOptions): string {
  return createHttpOrigin(config.env.PORT, options);
}

export function resolveApiServerOrigin(options?: BindOriginOptions): string {
  return createHttpOrigin(config.env.API_SERVER_PORT, options);
}

export function resolveCollabServerOrigin(options?: BindOriginOptions): string {
  return createHttpOrigin(config.env.COLLAB_SERVER_PORT, options);
}
