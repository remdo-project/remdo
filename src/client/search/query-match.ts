// Shared query matching for the document search and the note-link picker.
//
// Semantics: case-insensitive, tokenized substring AND, scoped to a note's path.
// The query is split on whitespace into tokens; a note matches when every token
// is a substring of some entry in its path (ancestor chain + the note itself) and
// at least one token is a substring of the note's own text. Tokens are
// order-independent ("foo bar" and "  bar\tfoo" match the same notes) and extra
// whitespace is irrelevant. The leaf-first guard (≥1 token on the note itself)
// keeps an ancestor match from pulling in its whole subtree. No fuzzy matching
// and no ranking — matches are returned in candidate order by the caller. Empty
// query matches everything.
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

/** Path-scoped match: `path` is the note's ancestor chain plus the note's own
 *  text as the last entry. Matches when every token is a substring of some path
 *  entry AND at least one token is a substring of the last entry (the note
 *  itself). Empty query matches everything. */
export function matchesPathQuery(path: readonly string[], query: string): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return true;
  }
  const haystack = path.map((entry) => entry.toLocaleLowerCase());
  const ownText = haystack.at(-1) ?? '';
  let anyOnOwnText = false;
  for (const token of tokens) {
    if (!haystack.some((entry) => entry.includes(token))) {
      return false;
    }
    if (ownText.includes(token)) {
      anyOnOwnText = true;
    }
  }
  return anyOnOwnText;
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
