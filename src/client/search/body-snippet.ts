// A one-line preview of a note body for a search result row
// (docs/specs/outliner/search.md "Result row context"). Pure string work over
// query semantics, like the matcher beside it.

import { queryMatchRanges } from './query-match';

/** Characters of body text a row shows. A budget, not a hard cap: snapping to
 *  word boundaries may extend the window slightly rather than cut a word. */
export const BODY_SNIPPET_BUDGET = 80;

const WHITESPACE_RUN = /\s+/gu;

/** Body text as one line: hard line breaks and runs of whitespace collapse to a
 *  single space, so a multi-line body still previews on one row. */
function toSingleLine(body: string): string {
  return body.replace(WHITESPACE_RUN, ' ').trim();
}

const isSpaceAt = (text: string, index: number): boolean => /\s/u.test(text[index] ?? '');

/** The nearest word boundary at or before `index`, or `index` itself when none
 *  lies within `slack` — so a single over-long word still truncates exactly. */
function snapStart(text: string, index: number, slack: number): number {
  for (let candidate = index; candidate > index - slack && candidate > 0; candidate -= 1) {
    if (isSpaceAt(text, candidate - 1)) {
      return candidate;
    }
  }
  return index;
}

/** The nearest word boundary at or after `index`, or `index` itself when none
 *  lies within `slack`. */
function snapEnd(text: string, index: number, slack: number): number {
  for (let candidate = index; candidate < index + slack && candidate < text.length; candidate += 1) {
    if (isSpaceAt(text, candidate)) {
      return candidate;
    }
  }
  return index;
}

/**
 * A single-line window of `body` for display beside a search result.
 *
 * With a query match in the body, the window centres on the first match so the
 * matched text is visible; later matches may fall outside it. Without one — an
 * empty query, or a match that was on the label — it shows the body's opening.
 * `…` marks each end the window does not reach.
 */
export function bodySnippet(body: string, query: string, budget = BODY_SNIPPET_BUDGET): string {
  const text = toSingleLine(body);
  if (text.length <= budget) {
    return text;
  }

  const slack = Math.max(8, Math.floor(budget / 8));
  const [firstMatch] = queryMatchRanges(text, query);

  let start = 0;
  let end = budget;
  if (firstMatch) {
    // Centre the window on the match, then pull it back inside the text so a
    // match near either end still fills the budget. The budget is soft: a match
    // longer than it widens the window rather than being cut, since a partial
    // match would neither highlight nor explain why the note matched.
    const matchLength = firstMatch.end - firstMatch.start;
    const padding = Math.max(0, Math.floor((budget - matchLength) / 2));
    start = Math.max(0, firstMatch.start - padding);
    end = Math.min(text.length, Math.max(start + budget, firstMatch.end));
    start = Math.max(0, Math.min(firstMatch.start, end - budget));
  }

  if (start > 0) {
    start = snapStart(text, start, slack);
  }
  if (end < text.length) {
    end = snapEnd(text, end, slack);
  }

  const leading = start > 0 ? '…' : '';
  const trailing = end < text.length ? '…' : '';
  return `${leading}${text.slice(start, end).trim()}${trailing}`;
}
