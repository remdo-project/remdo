import type { MicromarkToken, Rule } from 'markdownlint';

// Keep Markdown prose lines readable without charging hidden link syntax to
// their length. The rule removes link/image label markers, destinations,
// titles, and reference identifiers before measuring. Visible autolink URLs
// remain part of the measured text.

// markdownlint parses with the GFM table and autolink-literal extensions, whose
// token types `MicromarkToken['type']` does not carry: they are declared by
// `micromark-extension-gfm-*`, which reaches us only transitively and so cannot
// be augmented from here. Widening the matched type keeps these two comparisons
// honest instead of asserting the token shape.
type TokenType = MicromarkToken['type'] | 'table' | 'literalAutolink';

const tokenType = (token: MicromarkToken): TokenType => token.type;

type Visitor = (token: MicromarkToken, insideLink: boolean) => void;

type Range = [start: number, end: number];

const walk = (tokens: readonly MicromarkToken[], visit: Visitor, insideLink = false): void => {
  for (const token of tokens) {
    const childInsideLink = insideLink
      || token.type === 'link'
      || token.type === 'image'
      || token.type === 'autolink'
      || tokenType(token) === 'literalAutolink';
    visit(token, childInsideLink);
    walk(token.children, visit, childInsideLink);
  }
};

const addTokenLines = (lines: Set<number>, token: MicromarkToken): void => {
  for (let line = token.startLine; line <= token.endLine; line += 1) {
    lines.add(line);
  }
};

/**
 * Add the source interval occupied by a token to each covered line. Intervals
 * use zero-based, end-exclusive string indices.
 */
const ignoreToken = (
  ignored: Map<number, Range[]>,
  token: MicromarkToken,
  sourceLines: readonly string[],
): void => {
  for (let lineNumber = token.startLine; lineNumber <= token.endLine; lineNumber += 1) {
    const source = sourceLines[lineNumber - 1];
    if (source === undefined) {
      continue;
    }
    const start = lineNumber === token.startLine ? token.startColumn - 1 : 0;
    const end = lineNumber === token.endLine ? token.endColumn - 1 : source.length;
    if (end > start) {
      const ranges = ignored.get(lineNumber) ?? [];
      ranges.push([start, end]);
      ignored.set(lineNumber, ranges);
    }
  }
};

const measuredLine = (source: string, ranges: readonly Range[]): string => {
  const ignored = new Uint8Array(source.length);
  for (const [rawStart, rawEnd] of ranges) {
    const start = Math.max(0, rawStart);
    const end = Math.min(source.length, rawEnd);
    ignored.fill(1, start, end);
  }

  let text = '';
  for (let index = 0; index < source.length; index += 1) {
    if (ignored[index] === 0) {
      text += source[index];
    }
  }
  return text;
};

const rule: Rule = {
  names: ['remdo-link-aware-line-length'],
  description: 'Line length counts link labels but not destinations',
  tags: ['line_length', 'remdo'],
  parser: 'micromark',
  function: (params, onError) => {
    const lineLength = Number(params.config.line_length ?? 80);

    const codeBlocks = new Set<number>();
    const tables = new Set<number>();
    const definitions = new Set<number>();
    const ignored = new Map<number, Range[]>();

    const { tokens } = params.parsers.micromark;
    walk(tokens, (token, insideLink) => {
      if (token.type === 'codeFenced' || token.type === 'codeIndented') {
        addTokenLines(codeBlocks, token);
      } else if (tokenType(token) === 'table') {
        addTokenLines(tables, token);
      } else if (token.type === 'definition') {
        addTokenLines(definitions, token);
      }

      if (insideLink && (token.type === 'resource'
        || token.type === 'reference'
        || token.type === 'labelMarker'
        || token.type === 'labelImageMarker'
        || token.type === 'autolinkMarker')) {
        ignoreToken(ignored, token, params.lines);
      }
    });

    for (const [lineIndex, source] of params.lines.entries()) {
      const lineNumber = lineIndex + 1;
      const inCode = codeBlocks.has(lineNumber);
      const inTable = tables.has(lineNumber);
      const visible = measuredLine(
        source,
        ignored.get(lineNumber) ?? [],
      );
      // Preserve MD013's default exception: the final non-whitespace token may
      // cross the limit when it begins within the limit.
      const measured = visible.replace(/\S*$/u, '#');

      if (lineLength > 0
        && !inCode
        && !inTable
        && !definitions.has(lineNumber)
        && visible.length > lineLength
        && measured.length > lineLength) {
        onError({
          lineNumber,
          detail: `Expected: ${lineLength}; Actual: ${visible.length}`,
        });
      }
    }
  },
};

export default rule;
