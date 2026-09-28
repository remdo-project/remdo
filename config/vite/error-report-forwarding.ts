import { Buffer } from 'node:buffer';
import type { Plugin } from 'vite';

const RATE_LIMIT_HEADERS = ['retry-after', 'x-sentry-rate-limits'];

// <scheme>://<key>@<host>[/<prefix>]/<project> → the project's envelope endpoint.
function envelopeUrl(dsn: string): string {
  const url = new URL(dsn);
  const segments = url.pathname.split('/');
  const project = segments.pop()!;
  return `${url.origin}${segments.join('/')}/api/${project}/envelope/`;
}

// Development counterpart of the production gateway's forwarding: only the
// envelope leaves, without the browser's cookies, addresses, or other headers.
export function errorReportForwarding(dsn: string): Plugin {
  const target = envelopeUrl(dsn);
  return {
    name: 'error-report-forwarding',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'POST' || req.url !== '/api/error-reports') {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          void fetch(target, {
            method: 'POST',
            body: Buffer.concat(chunks),
            headers: { 'Content-Type': 'application/x-sentry-envelope' },
          }).then((reply) => {
            res.statusCode = reply.status;
            for (const name of RATE_LIMIT_HEADERS) {
              const value = reply.headers.get(name);
              if (value) res.setHeader(name, value);
            }
          }, () => {
            res.statusCode = 502;
          }).finally(() => {
            res.setHeader('Cache-Control', 'no-store');
            res.end();
          });
        });
      });
    },
  };
}
