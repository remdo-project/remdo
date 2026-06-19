import { describe, expect, it } from 'vitest';
import { matchesQuery, queryMatchRanges, tokenizeQuery } from '#client/search/query-match';

describe('tokenizeQuery', () => {
  it('lowercases and splits on whitespace runs, dropping empties', () => {
    expect(tokenizeQuery('  Foo\t  BAR \n baz ')).toEqual(['foo', 'bar', 'baz']);
  });

  it('returns no tokens for empty or whitespace-only queries', () => {
    expect(tokenizeQuery('')).toEqual([]);
    expect(tokenizeQuery('   \t\n')).toEqual([]);
  });
});

describe('matchesQuery', () => {
  it('matches everything for an empty query', () => {
    expect(matchesQuery('anything', '')).toBe(true);
    expect(matchesQuery('', '   ')).toBe(true);
  });

  it('is case-insensitive substring matching', () => {
    expect(matchesQuery('Sprint Backlog', 'sprint')).toBe(true);
    expect(matchesQuery('Sprint Backlog', 'BACK')).toBe(true);
    expect(matchesQuery('Sprint Backlog', 'xyz')).toBe(false);
  });

  it('requires every token (AND), order-independent', () => {
    expect(matchesQuery('TODO refine estimates', 'refine todo')).toBe(true);
    expect(matchesQuery('TODO refine estimates', 'todo missing')).toBe(false);
  });

  it('ignores extra whitespace in the query', () => {
    expect(matchesQuery('foo and bar', '  bar\t  foo  ')).toBe(true);
  });

  it('matches each token as a substring (not whole-word)', () => {
    // "road" and "map" are both substrings of "roadmapping".
    expect(matchesQuery('Roadmapping', 'road map')).toBe(true);
    expect(matchesQuery('Roadmap planning', 'map plan')).toBe(true);
    // "xmap" is not a substring anywhere.
    expect(matchesQuery('Roadmap planning', 'plan xmap')).toBe(false);
  });
});

describe('queryMatchRanges', () => {
  it('returns no ranges for an empty query', () => {
    expect(queryMatchRanges('anything', '')).toEqual([]);
  });

  it('returns ranges in original-text indices for each token occurrence', () => {
    // text: "todo refine todo" — token "todo" occurs at 0 and 12.
    expect(queryMatchRanges('todo refine todo', 'todo')).toEqual([
      { start: 0, end: 4 },
      { start: 12, end: 16 },
    ]);
  });

  it('covers multiple tokens, sorted by start', () => {
    // "refine" at 5..11, "todo" at 0..4
    expect(queryMatchRanges('todo refine', 'refine todo')).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 11 },
    ]);
  });

  it('merges overlapping/adjacent token ranges', () => {
    // tokens "ab" (0..2) and "bc" (1..3) overlap → merged 0..3.
    expect(queryMatchRanges('abc', 'ab bc')).toEqual([{ start: 0, end: 3 }]);
  });

  it('omits tokens that do not occur', () => {
    expect(queryMatchRanges('foo bar', 'foo zzz')).toEqual([{ start: 0, end: 3 }]);
  });
});
