import { describe, expect, it } from 'vitest';
import { matchesPathQuery, queryMatchRanges, tokenizeQuery } from '#client/search/query-match';

describe('tokenizeQuery', () => {
  it('lowercases and splits on whitespace runs, dropping empties', () => {
    expect(tokenizeQuery('  Foo\t  BAR \n baz ')).toEqual(['foo', 'bar', 'baz']);
  });

  it('returns no tokens for empty or whitespace-only queries', () => {
    expect(tokenizeQuery('')).toEqual([]);
    expect(tokenizeQuery('   \t\n')).toEqual([]);
  });
});

describe('matchesPathQuery', () => {
  it('matches everything for an empty query', () => {
    expect(matchesPathQuery(['Work', 'anything'], '')).toBe(true);
    expect(matchesPathQuery([''], '   ')).toBe(true);
  });

  it('matches case-insensitive substrings against a single-entry path', () => {
    expect(matchesPathQuery(['Sprint Backlog'], 'sprint')).toBe(true);
    expect(matchesPathQuery(['Sprint Backlog'], 'BACK')).toBe(true);
    expect(matchesPathQuery(['Sprint Backlog'], 'xyz')).toBe(false);
  });

  it('requires every token (AND), order-independent', () => {
    expect(matchesPathQuery(['TODO refine estimates'], 'refine todo')).toBe(true);
    expect(matchesPathQuery(['TODO refine estimates'], 'todo missing')).toBe(false);
  });

  it('ignores extra whitespace in the query', () => {
    expect(matchesPathQuery(['foo and bar'], '  bar\t  foo  ')).toBe(true);
  });

  it('matches each token as a substring (not whole-word)', () => {
    expect(matchesPathQuery(['Roadmapping'], 'road map')).toBe(true);
    expect(matchesPathQuery(['Roadmap planning'], 'map plan')).toBe(true);
    expect(matchesPathQuery(['Roadmap planning'], 'plan xmap')).toBe(false);
  });

  it('lets a token match an ancestor as long as one token hits the note itself', () => {
    // 'r' is in the 'Work' ancestor, 'p' is in the note 'Q3 planning'.
    expect(matchesPathQuery(['Work', 'Q3 planning'], 'r p')).toBe(true);
    // Both tokens hit the note itself.
    expect(matchesPathQuery(['Work', 'Hiring plan'], 'r p')).toBe(true);
  });

  it('requires at least one token on the note itself (leaf-first guard)', () => {
    // Every token matches only the ancestor, none the note → excluded, so an
    // ancestor match never pulls in the whole subtree.
    expect(matchesPathQuery(['Work', 'Q3 planning'], 'work')).toBe(false);
    expect(matchesPathQuery(['Engineering', 'Hiring'], 'eng')).toBe(false);
  });

  it('fails when a token matches nowhere in the path', () => {
    expect(matchesPathQuery(['Work', 'Q3 planning'], 'plan zzz')).toBe(false);
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
