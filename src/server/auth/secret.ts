import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';

// Constant-time comparison for shared secrets (admin secret, server tokens).
// timingSafeEqual requires equal-length buffers; an early length check leaks
// only length, not content, which is not the side channel that matters here.
export function secretsMatch(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const providedBytes = Buffer.from(provided, 'utf8');
  if (expectedBytes.length !== providedBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, providedBytes);
}
