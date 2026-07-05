// References-section shape (docs/documentation.md invariant 3): a `## References`
// section collects external sources only — no links into the corpus. Inside that
// section, any link or reference definition whose target is not external (a URL
// scheme or a protocol-relative `//host`) is a violation; corpus links belong
// inline in the body. Applies to docs/ only; skill files are exempt (their
// References link sibling skills by design).
//
// The section runs from the `## References` heading to the next level-2 heading
// (matching the old checker: `###`/`####` subheadings stay inside it). Links come
// from the micromark token stream, so code-span/fenced examples never count.

import { isDocsFile } from './docs-scope.mjs';

// External = a URL scheme (`https:`, `mailto:`) or protocol-relative (`//host`).
// Same test the relative-links rule uses to skip a target, so the two rules
// agree on what counts as a corpus link.
const isExternal = (target) => /^[a-z][a-z+.-]*:/i.test(target) || target.startsWith('//');

/**
 * Recursively collect tokens of the given type.
 *
 * @param {import("markdownlint").MicromarkToken[]} tokens
 * @param {(t: import("markdownlint").MicromarkToken) => boolean} predicate
 * @param {import("markdownlint").MicromarkToken[]} out
 */
const collect = (tokens, predicate, out) => {
  for (const token of tokens) {
    if (predicate(token)) {
      out.push(token);
    }
    if (token.children.length > 0) {
      collect(token.children, predicate, out);
    }
  }
};

// The destination text of a link or a reference definition, unwrapping the
// optional `<...>` literal form so `[a](<https://x.y/a b>)` reads as external.
const destinationText = (token) => {
  const dest = [];
  collect([token], (t) => t.type === 'resourceDestinationString' || t.type === 'definitionDestinationString', dest);
  return dest.map((t) => t.text).join('');
};

// ATX heading level = the length of its `#` run; the corpus is ATX-only.
const headingLevel = (heading) => {
  const sequence = heading.children.find((c) => c.type === 'atxHeadingSequence');
  return sequence ? Math.min(sequence.text.length, 6) : 1;
};

// Heading text = the concatenated text of its atxHeadingText descendants.
const headingText = (heading) => {
  const text = [];
  collect([heading], (t) => t.type === 'atxHeadingText', text);
  return text.map((t) => t.text).join('').trim();
};

/** @type {import("markdownlint").Rule} */
export default {
  names: ['remdo-references-shape'],
  description: 'Links in a docs References section must be external',
  information: new URL('https://github.com/remdo/remdo/blob/main/docs/documentation.md'),
  tags: ['remdo'],
  parser: 'micromark',
  function: (params, onError) => {
    if (!isDocsFile(params.name)) {
      return;
    }
    const { tokens } = params.parsers.micromark;
    const headings = [];
    collect(tokens, (t) => t.type === 'atxHeading', headings);

    // The line at which the References section starts and the line at which it
    // ends (exclusive) — the next level-2 heading, or end of file.
    let start = -1;
    let end = params.lines.length + 1;
    for (const heading of headings) {
      const level = headingLevel(heading);
      if (start === -1) {
        if (level === 2 && headingText(heading) === 'References') {
          start = heading.startLine;
        }
      } else if (level <= 2) {
        end = heading.startLine;
        break;
      }
    }
    if (start === -1) {
      return;
    }

    const links = [];
    collect(tokens, (t) => t.type === 'link' || t.type === 'image' || t.type === 'definition', links);
    for (const link of links) {
      if (link.startLine <= start || link.startLine >= end) {
        continue;
      }
      const destination = destinationText(link);
      // Reference-style links/images (`[MDN][mdn]`, `![x][y]`) carry no inline
      // destination — their `[mdn]: url` definition is a separate `definition`
      // token checked on its own. Skip the empty-destination reference so it
      // isn't mis-flagged as an internal (non-external) link; the definition
      // still gets its own external check.
      if (destination === '') {
        continue;
      }
      if (!isExternal(destination)) {
        onError({
          lineNumber: link.startLine,
          detail: 'internal link inside References (must be inline in the body)',
          context: params.lines[link.startLine - 1],
        });
      }
    }
  },
};
