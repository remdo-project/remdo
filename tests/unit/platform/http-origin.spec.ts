import { describe, expect, it } from 'vitest';
import { isHttpOrigin } from '#platform/net/http-origin';

describe('isHttpOrigin', () => {
  it('accepts bare http and https origins', () => {
    expect(isHttpOrigin('https://source.example')).toBe(true);
    expect(isHttpOrigin('http://localhost:4000')).toBe(true);
    expect(isHttpOrigin('https://source.example:8443')).toBe(true);
  });

  it('rejects non-http(s) schemes even when URL.origin equals the input', () => {
    expect(isHttpOrigin('ws://source.example')).toBe(false);
    expect(isHttpOrigin('ftp://source.example')).toBe(false);
    expect(isHttpOrigin('javascript:alert(1)//')).toBe(false);
  });

  it('rejects anything that is more than a bare origin', () => {
    expect(isHttpOrigin('https://source.example/path')).toBe(false);
    expect(isHttpOrigin('https://source.example?x=1')).toBe(false);
    expect(isHttpOrigin('not-a-url')).toBe(false);
    expect(isHttpOrigin('')).toBe(false);
  });
});
