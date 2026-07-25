// References-section shape (docs/documentation.md invariant 3): a `## References`
// section collects external sources only — no links into the corpus. Inside that
// section, any link or reference definition whose target is not external (a URL
// scheme or a protocol-relative `//host`) is a violation; corpus links belong
// inline in the body. The private runner passes docs/**/*.md only; product
// markdown lint does not load this rule.
//
// The section runs from the `## References` heading to the next level-2 heading
// (matching the old checker: `###`/`####` subheadings stay inside it). Links come
// from the micromark token stream, so code-span/fenced examples never count.

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

// The concatenated text of the first descendant of `type` (a label / reference
// identifier), lowercased so link references and definitions match regardless
// of case (CommonMark reference matching is case-insensitive). '' if absent.
const identifierText = (token, type) => {
  const found = [];
  collect([token], (t) => t.type === type, found);
  return found.map((t) => t.text).join('').trim().toLowerCase();
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

    // Map every reference definition's label -> its destination, across the
    // whole file. A reference-style link inside References resolves through this
    // so its target is checked even when the `[label]: url` definition sits
    // outside the section (the definition's own line is only range-checked when
    // it falls inside References).
    const definitions = [];
    collect(tokens, (t) => t.type === 'definition', definitions);
    // CommonMark resolves a duplicate label to its FIRST definition, so keep the
    // first destination seen per label rather than letting a later duplicate
    // (possibly external) mask an earlier internal one.
    const defDestination = new Map();
    for (const d of definitions) {
      const label = identifierText(d, 'definitionLabelString');
      if (!defDestination.has(label)) {
        defDestination.set(label, destinationText(d));
      }
    }

    const flag = (line) => onError({
      lineNumber: line,
      detail: 'internal link inside References (must be inline in the body)',
      context: params.lines[line - 1],
    });

    const links = [];
    collect(tokens, (t) => t.type === 'link' || t.type === 'image' || t.type === 'definition', links);
    for (const link of links) {
      if (link.startLine <= start || link.startLine >= end) {
        continue;
      }
      const destination = destinationText(link);
      if (destination === '') {
        // A reference-style link/image (`[MDN][mdn]`, `![x][y]`) carries no
        // inline destination; resolve its `[label]` through the definition map
        // and check that target, so an internal definition anywhere in the file
        // is caught (not only when it happens to sit inside References).
        const label = identifierText(link, 'referenceString')
          || identifierText(link, 'labelText'); // shortcut form `[label]`
        const resolved = defDestination.get(label);
        // An undefined label isn't a resolvable corpus link; leave it (a
        // dangling reference is the relative-links rule's concern, not shape).
        if (resolved !== undefined && !isExternal(resolved)) {
          flag(link.startLine);
        }
        continue;
      }
      if (!isExternal(destination)) {
        flag(link.startLine);
      }
    }
  },
};
