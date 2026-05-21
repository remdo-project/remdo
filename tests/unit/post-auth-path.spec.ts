import { describe, expect, it } from 'vitest';
import {
  createPostAuthNextSearch,
  resolveNextPathOrDefault,
  resolvePostAuthTargetPath,
} from '@/routes/post-auth-path';

const CURRENT_ORIGIN = 'https://remdo.test';

describe('post-auth paths', () => {
  it('builds a next search param from the current route', () => {
    const search = createPostAuthNextSearch(new Request('https://remdo.test/n/main?lexicalDemo=true'));

    expect(new URLSearchParams(search).get('next')).toBe('/n/main?lexicalDemo=true');
  });

  it('allows relative post-auth targets', () => {
    expect(resolvePostAuthTargetPath('/', CURRENT_ORIGIN)).toBe('/');
    expect(resolvePostAuthTargetPath('/home', CURRENT_ORIGIN)).toBe('/home');
    expect(resolvePostAuthTargetPath('/n/main', CURRENT_ORIGIN)).toBe('/n/main');
    expect(resolvePostAuthTargetPath('/n/main_note2?lexicalDemo=true', CURRENT_ORIGIN))
      .toBe('/n/main_note2?lexicalDemo=true');
    expect(resolvePostAuthTargetPath('/api/me', CURRENT_ORIGIN)).toBe('/api/me');
    expect(resolvePostAuthTargetPath('n/main', CURRENT_ORIGIN)).toBe('/n/main');
    expect(resolvePostAuthTargetPath('https://remdo.test/n/main', CURRENT_ORIGIN)).toBe('/n/main');
  });

  it('normalizes post-auth targets as route paths', () => {
    expect(resolvePostAuthTargetPath('/n/../home?lexicalDemo=true#main', CURRENT_ORIGIN))
      .toBe('/home?lexicalDemo=true#main');
    expect(resolvePostAuthTargetPath('/..//example.test/n/main', CURRENT_ORIGIN)).toBe('/example.test/n/main');
  });

  it('rejects external post-auth targets', () => {
    for (const target of [
      '//example.test/n/main',
      'https://example.test/n/main',
      String.raw`/\example.test/n/main`,
    ]) {
      expect(resolvePostAuthTargetPath(target, CURRENT_ORIGIN)).toBeNull();
    }
  });

  it('uses the caller-provided default path when there is no accepted next target', () => {
    expect(resolveNextPathOrDefault('', CURRENT_ORIGIN, '/default')).toBe('/default');
    expect(resolveNextPathOrDefault('?next=%2F%2Fexample.test%2Fn%2Fmain', CURRENT_ORIGIN, '/default'))
      .toBe('/default');
    expect(resolveNextPathOrDefault('?next=%2F%5Cexample.test%2Fn%2Fmain', CURRENT_ORIGIN, '/default'))
      .toBe('/default');
  });
});
