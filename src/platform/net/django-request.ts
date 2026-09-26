import { Buffer } from 'node:buffer';
import { request as httpRequest } from 'node:http';

// Node fetch ignores a caller-supplied Host. The internal loopback connection
// must preserve Django's canonical public host without widening ALLOWED_HOSTS.
export function requestDjango(url: URL, options: {
  method?: string;
  headers: Record<string, string>;
  body?: Buffer;
  signal: AbortSignal;
}): Promise<{ ok: boolean; status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, options, (response) => {
      void (async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of response) chunks.push(Buffer.from(chunk));
        resolve({ ok: response.statusCode! >= 200 && response.statusCode! < 300, status: response.statusCode!, body: Buffer.concat(chunks) });
      })().catch(reject);
    });
    request.once('error', reject);
    request.end(options.body);
  });
}
