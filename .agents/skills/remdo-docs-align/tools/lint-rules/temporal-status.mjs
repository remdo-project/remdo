// Temporal-status wording (spec/documentation.md target behavior): spec prose is
// timeless. Conservative token list — only unambiguous status markers; "new" is
// semantic (feature-age vs domain use) and stays with review. The legacy backlog
// retains status wording, so it is exempt. The private runner passes docs/**/*.md
// only; product markdown lint does not load this rule.
//
// Riding the micromark token stream, code spans and fenced blocks are distinct
// token types (codeText / codeFlowValue …), so their content never reaches the
// prose `data` tokens this rule scans — the exclusion the old hand-rolled
// checker did by blanking fences is free and correct here. Link destinations are
// skipped too so a URL is never mistaken for prose.

const TEMPORAL = /\bfor now\b|\bcurrently\b|\bat the moment\b|\bnot yet\b|\bwill soon\b|\(early draft\)/i;
// Exact repo-relative paths, not basenames: only the closed legacy backlog is
// exempt.
const EXEMPT = new Set(['docs/legacy-backlog.md']);

// Descendant token types whose text is a link/image destination, not prose.
const DESTINATION = new Set(['resourceDestination', 'definitionDestination']);

/**
 * Collect prose `data` tokens, skipping any inside a link/image destination.
 *
 * @param {import("markdownlint").MicromarkToken[]} tokens
 * @param {import("markdownlint").MicromarkToken[]} out
 */
const collectProse = (tokens, out) => {
  for (const token of tokens) {
    if (DESTINATION.has(token.type)) {
      continue;
    }
    if (token.type === 'data') {
      out.push(token);
    }
    if (token.children.length > 0) {
      collectProse(token.children, out);
    }
  }
};

/** @type {import("markdownlint").Rule} */
export default {
  names: ['remdo-temporal-status'],
  description: 'Docs prose must not use temporal-status wording',
  information: new URL('https://github.com/remdo/remdo/blob/main/spec/documentation.md#target-behavior'),
  tags: ['remdo'],
  parser: 'micromark',
  function: (params, onError) => {
    const rel = params.name.replace(/\\/g, '/');
    if (EXEMPT.has(rel)) {
      return;
    }
    const prose = [];
    collectProse(params.parsers.micromark.tokens, prose);
    for (const token of prose) {
      const match = TEMPORAL.exec(token.text);
      if (match) {
        onError({
          lineNumber: token.startLine,
          detail: `temporal-status wording: ${match[0]}`,
          context: params.lines[token.startLine - 1],
        });
      }
    }
  },
};
