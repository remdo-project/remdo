// Shared query matching for the document search and the note-link picker.
//
// Semantics: case-insensitive, tokenized substring AND. The query is split on
// whitespace into tokens; a candidate matches when every token occurs as a
// substring of its text. Tokens are order-independent ("foo bar" and "  bar\tfoo"
// match the same candidates) and extra whitespace in the query is irrelevant.
// No fuzzy matching and no ranking — matches are returned in candidate order by
// the caller. Empty query matches everything.
//
// This is pure query semantics over plain strings; it deliberately lives outside
// the note SDK (which owns note access, not matching).

export interface MatchRange {
  start: number;
  end: number;
}

/** Splits a query into lowercased, whitespace-free tokens (empty → no tokens). */
export function tokenizeQuery(query: string): string[] {
  return query.toLocaleLowerCase().split(/\s+/u).filter((token) => token.length > 0);
}

/** True when every query token is a substring of `text` (case-insensitive). An
 *  empty query (no tokens) matches everything. */
export function matchesQuery(text: string, query: string): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return true;
  }
  const haystack = text.toLocaleLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

/** Ranges (in `text`'s own indices) where any query token occurs, for
 *  highlighting. Overlapping/adjacent ranges are merged; sorted by start. */
export function queryMatchRanges(text: string, query: string): MatchRange[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return [];
  }

  const haystack = text.toLocaleLowerCase();
  const ranges: MatchRange[] = [];
  for (const token of tokens) {
    let from = haystack.indexOf(token);
    while (from !== -1) {
      ranges.push({ start: from, end: from + token.length });
      from = haystack.indexOf(token, from + token.length);
    }
  }
  if (ranges.length === 0) {
    return [];
  }

  ranges.sort((left, right) => left.start - right.start);
  const merged: MatchRange[] = [ranges[0]!];
  for (const range of ranges.slice(1)) {
    const last = merged.at(-1)!;
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push(range);
    }
  }
  return merged;
}
