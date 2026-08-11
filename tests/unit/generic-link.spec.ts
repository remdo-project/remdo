import { describe, expect, it } from 'vitest';

import {
  automaticGenericLinkMatcher,
  normalizeGenericDestination,
} from '#client/editor/links/generic-link';

describe('generic link classification (docs/specs/outliner/links.md)', () => {
  it.each([
    ['https://example.com', { kind: 'web', url: 'https://example.com/' }],
    ['http://localhost:3000/path', { kind: 'web', url: 'http://localhost:3000/path' }],
    ['example.com/path', { kind: 'web', url: 'https://example.com/path' }],
    ['www.example.com', { kind: 'web', url: 'https://www.example.com/' }],
    ['www.example.com:8443/path', { kind: 'web', url: 'https://www.example.com:8443/path' }],
    ['user@example.com', { kind: 'email', url: 'mailto:user@example.com' }],
    ['a?b@example.com', { kind: 'email', url: 'mailto:a%3Fb@example.com' }],
    ['user@bücher.de', { kind: 'email', url: 'mailto:user@xn--bcher-kva.de' }],
  ])('normalizes explicitly authored %s', (input, expected) => {
    expect(normalizeGenericDestination(input)).toEqual(expected);
  });

  it.each([
    '//example.com',
    '/relative/path',
    'localhost:3000',
    '127.0.0.1',
    'https://user:password@example.com',
    'https://user:(foo@example.com',
    'javascript:alert(1)',
    'user@example.com?subject=hello',
    'mailto:user@example.com?subject=hello',
    'mailto:user@example.com%3Fsubject=hello',
    'δοκιμή@example.com',
  ])('rejects explicitly authored %s', (input) => {
    expect(normalizeGenericDestination(input)).toBeNull();
  });

  it.each([
    ['https://example.com', 'https://example.com/'],
    ['www.example.com', 'https://www.example.com/'],
    ['www.example.com:8443/path', 'https://www.example.com:8443/path'],
    ['user@example.com', 'mailto:user@example.com'],
    ["o'reilly@example.com", "mailto:o'reilly@example.com"],
    ['a?b@example.com', 'mailto:a%3Fb@example.com'],
    ['http://127.0.0.1/path', 'http://127.0.0.1/path'],
  ])('automatically recognizes %s', (input, expectedUrl) => {
    expect(automaticGenericLinkMatcher(input)).toMatchObject({
      index: 0,
      length: input.length,
      text: input,
      url: expectedUrl,
    });
  });

  it.each(["'", '"'])('treats a leading %s as an email opener', (opener) => {
    const email = 'foo@example.com';
    expect(automaticGenericLinkMatcher(`${opener}${email}`)).toMatchObject({
      index: opener.length,
      length: email.length,
      text: email,
      url: `mailto:${email}`,
    });
  });

  it.each([
    'example.com',
    '//example.com',
    'localhost:3000',
    '127.0.0.1',
    'https://user:password@example.com',
    "https://'foo@example.com",
    'user@example.com?subject=hello',
    '.www.example.com',
    'http://example.com,https://other.com',
    'https://example.com\\evil.com',
  ])('leaves ambiguous or unsafe automatic candidate %s as text', (input) => {
    expect(automaticGenericLinkMatcher(input)).toBeNull();
  });

  it.each([
    'http://example.com,https://other.com y',
    'https://example.com\\evil.com x',
  ])('rejects the complete unsafe candidate in %s after a following boundary', (input) => {
    expect(automaticGenericLinkMatcher(input)).toBeNull();
  });

  it('keeps a nested URL-looking segment in a valid absolute URL path', () => {
    const input = 'https://example.com/path,https://other.com';
    expect(automaticGenericLinkMatcher(`${input} `)).toMatchObject({
      index: 0,
      length: input.length,
      text: input,
      url: input,
    });
  });

  it.each([
    [String.raw`https://example.com/a\"b`, 'https://example.com/a/%22b'],
    [String.raw`https://example.com/a\<b`, 'https://example.com/a/%3Cb'],
  ])('keeps an escaped delimiter in %s', (input, expectedUrl) => {
    expect(automaticGenericLinkMatcher(`${input} `)).toMatchObject({
      index: 0,
      length: input.length,
      text: input,
      url: expectedUrl,
    });
  });

  it('prefers an initial www candidate over an email-shaped path', () => {
    const input = 'www.github.com/user@example.com';
    expect(automaticGenericLinkMatcher(`${input} `)).toMatchObject({
      index: 0,
      length: input.length,
      text: input,
      url: 'https://www.github.com/user@example.com',
    });
  });

  it('excludes trailing punctuation and an unmatched closer', () => {
    const input = 'https://example.com/path).';
    expect(automaticGenericLinkMatcher(input)).toMatchObject({
      index: 0,
      length: 'https://example.com/path'.length,
      text: 'https://example.com/path',
    });
  });

  it('keeps an unmatched closer that is internal to the candidate', () => {
    const input = 'https://example.com/a)b';
    expect(automaticGenericLinkMatcher(input)).toMatchObject({
      index: 0,
      length: input.length,
      text: input,
    });
  });

  it('keeps punctuation and an unmatched closer that are internal to the candidate', () => {
    const input = 'https://example.com/path.)rest';
    expect(automaticGenericLinkMatcher(input)).toMatchObject({
      index: 0,
      length: input.length,
      text: input,
    });
  });

  it('recognizes the earliest candidate when a later email is present', () => {
    const input = 'https://example.com user@example.com';
    expect(automaticGenericLinkMatcher(input)).toMatchObject({
      index: 0,
      text: 'https://example.com',
      url: 'https://example.com/',
    });
  });

  it.each([' ', '(', '[', '{', '<', '"', "'", '“', '‘'])(
    'recognizes a candidate after the accepted %s opener',
    (opener) => {
      const url = 'https://example.com/path';
      expect(automaticGenericLinkMatcher(`${opener}${url}`)).toMatchObject({
        index: opener.length,
        length: url.length,
        text: url,
      });
    },
  );

  it.each(['x', '-', ',', ')'])(
    'rejects a candidate after the non-opening %s character',
    (prefix) => {
      expect(automaticGenericLinkMatcher(`${prefix}https://example.com/path`)).toBeNull();
    },
  );

  it.each([' ', '<', '>', '"', '“', '”', '‘', '’'])(
    'ends a candidate before the %s delimiter',
    (delimiter) => {
      const url = 'https://example.com/path';
      expect(automaticGenericLinkMatcher(`${url}${delimiter}rest`)).toMatchObject({
        index: 0,
        length: url.length,
        text: url,
      });
    },
  );

  it('keeps a balanced trailing closer', () => {
    const input = 'https://example.com/foo_(bar)';
    expect(automaticGenericLinkMatcher(input)).toMatchObject({
      index: 0,
      length: input.length,
      text: input,
    });
  });
});
