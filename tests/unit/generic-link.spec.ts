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

  it.each([
    'example.com',
    '//example.com',
    'localhost:3000',
    '127.0.0.1',
    'https://user:password@example.com',
    'user@example.com?subject=hello',
    '.www.example.com',
  ])('leaves ambiguous or unsafe automatic candidate %s as text', (input) => {
    expect(automaticGenericLinkMatcher(input)).toBeNull();
  });

  it('excludes trailing punctuation and an unmatched closer', () => {
    const input = 'https://example.com/path).';
    expect(automaticGenericLinkMatcher(input)).toMatchObject({
      index: 0,
      length: 'https://example.com/path'.length,
      text: 'https://example.com/path',
    });
  });

  it('keeps a balanced trailing closer', () => {
    const input = 'https://example.com/foo_(bar)';
    expect(automaticGenericLinkMatcher(input)).toMatchObject({
      index: 0,
      length: input.length,
      text: input,
    });
  });
});
