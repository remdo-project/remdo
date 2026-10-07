import { config } from '#config';
import { INTERNAL_SERVICE_HOST } from '#platform/net/origins';

export function resolveLocalGatewayOrigin(): string {
  const host = config.env.HOST === '0.0.0.0' ? INTERNAL_SERVICE_HOST : config.env.HOST;
  return `http://${host}:${config.env.PORT}`;
}
