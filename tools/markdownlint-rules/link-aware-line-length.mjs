// Keep Markdown prose lines readable without charging hidden link syntax to
// their length. The rule removes link/image label markers, destinations,
// titles, and reference identifiers before measuring. Visible autolink URLs
// remain part of the measured text.

/**
 * Walk every token in a Micromark tree.
 *
 * @param {import("markdownlint").MicromarkToken[]} tokens
 * @param {(token: import("markdownlint").MicromarkToken, insideLink: boolean) => void} visit
 * @param {boolean} insideLink
 */
const walk = (tokens, visit, insideLink = false) => {
  for (const token of tokens) {
    const childInsideLink = insideLink
      || token.type === 'link'
      || token.type === 'image'
      || token.type === 'autolink'
      || token.type === 'literalAutolink';
    visit(token, childInsideLink);
    walk(token.children, visit, childInsideLink);
  }
};

/**
 * Add all 1-based source lines covered by a token to a set.
 *
 * @param {Set<number>} lines
 * @param {import("markdownlint").MicromarkToken} token
 */
const addTokenLines = (lines, token) => {
  for (let line = token.startLine; line <= token.endLine; line += 1) {
    lines.add(line);
  }
};

/**
 * Add the source interval occupied by a token to each covered line. Intervals
 * use zero-based, end-exclusive string indices.
 *
 * @param {Map<number, [number, number][]>} ignored
 * @param {import("markdownlint").MicromarkToken} token
 * @param {string[]} sourceLines
 */
const ignoreToken = (ignored, token, sourceLines) => {
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

/**
 * Remove ignored source intervals.
 *
 * @param {string} source
 * @param {[number, number][]} ranges
 */
const measuredLine = (source, ranges) => {
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

/** @type {import("markdownlint").Rule} */
export default {
  names: ['remdo-link-aware-line-length'],
  description: 'Line length counts link labels but not destinations',
  tags: ['line_length', 'remdo'],
  parser: 'micromark',
  function: (params, onError) => {
    const lineLength = Number(params.config.line_length ?? 80);

    const codeBlocks = new Set();
    const tables = new Set();
    const definitions = new Set();
    const ignored = new Map();

    const { tokens } = params.parsers.micromark;
    walk(tokens, (token, insideLink) => {
      if (token.type === 'codeFenced' || token.type === 'codeIndented') {
        addTokenLines(codeBlocks, token);
      } else if (token.type === 'table') {
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

    for (let lineIndex = 0; lineIndex < params.lines.length; lineIndex += 1) {
      const source = params.lines[lineIndex];
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
