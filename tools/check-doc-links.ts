// Doc link checker: every relative link in the Markdown files given as argv
// (tools/lint-md.sh passes the repo's selection, keeping it defined once)
// must resolve on disk, and a `#fragment` into a Markdown target must match a
// heading slug of that target. External (scheme) links are out of scope:
// checking them needs the network, and they are References-style background,
// not corpus structure. Prose rules (temporal-status wording, References
// shape) are covered by checkProse below.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';

export interface LinkIssue {
  file: string;
  line: number;
  message: string;
}

// Fenced code blocks, CommonMark-style: a fence opens with at most 3 spaces
// of indentation and 3+ backticks or tildes; it closes only on a line with
// the same fence character, at least the opener's run length, and no info
// string — so a ```js line inside an open ``` block is content, not a closer.
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;

// Blank every line inside fenced blocks (including the fence lines),
// preserving line count. Headings keep their inline code intact — GitHub
// slugs the code's text — so this is the only stripping slug extraction uses.
const blankFencedBlocks = (md: string): string[] => {
  let fence: string | null = null;
  return md.split('\n').map((line) => {
    if (fence) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1]![0] === fence[0] && close[1]!.length >= fence.length) {
        fence = null;
      }
      return '';
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      fence = open[1]!;
      return '';
    }
    return line;
  });
};

// Inline code spans, CommonMark-exact: a span opened by a run of N backticks
// closes at the next run of exactly N; shorter runs are span content (so
// `` a`b `` stays whole). Scanned manually — a regex can't express "exactly
// the opener's run" cleanly.
const blankInlineCode = (line: string): string => {
  const chars = [...line];
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] !== '`') {
      continue;
    }
    let open = i;
    while (chars[open] === '`') {
      open += 1;
    }
    const runLength = open - i;
    for (let j = open; j < chars.length; j += 1) {
      if (chars[j] !== '`') {
        continue;
      }
      let close = j;
      while (chars[close] === '`') {
        close += 1;
      }
      if (close - j === runLength) {
        for (let k = i; k < close; k += 1) {
          chars[k] = ' ';
        }
        i = close - 1;
        break;
      }
      j = close - 1;
    }
    while (chars[i + 1] === '`') {
      i += 1; // unmatched opener: skip its whole run
    }
  }
  return chars.join('');
};

// Blank fenced code blocks and inline code spans (preserving line count and
// per-line offsets) so links and prose inside examples are never checked —
// skill files quote whole Markdown snippets in fences.
export const stripCodeSegments = (md: string): string =>
  blankFencedBlocks(md).map(blankInlineCode).join('\n');

// Inline links/images `[text](target)` (optionally `(target "title")` or
// `(<target>)`) plus reference definitions `[label]: target`.
export const extractLinks = (md: string): { target: string; line: number }[] => {
  const links: { target: string; line: number }[] = [];
  stripCodeSegments(md).split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g)) {
      links.push({ target: match[1]!.replace(/^<|>$/g, ''), line: index + 1 });
    }
    const definition = /^\s{0,3}\[[^\]]+\]:\s+(\S+)/.exec(line);
    if (definition) {
      links.push({ target: definition[1]!, line: index + 1 });
    }
  });
  return links;
};

// GitHub-style heading slugs via github-slugger (underscores kept, each space
// a hyphen, duplicates suffixed -1, -2…). Headings are extracted from the raw
// text with only fenced blocks blanked; the remaining markdown is reduced to
// its text first: links to their text, `*` emphasis markers and backtick
// characters dropped (the code's content is part of the slug).
export const headingSlugs = (md: string): Set<string> => {
  const slugger = new GithubSlugger();
  const slugs = new Set<string>();
  for (const line of blankFencedBlocks(md)) {
    const heading = /^#{1,6} +(\S.*)$/.exec(line.trim());
    if (!heading) {
      continue;
    }
    const text = heading[1]!
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*`]/g, '');
    slugs.add(slugger.slug(text));
  }
  return slugs;
};

export const isExternal = (target: string): boolean =>
  /^[a-z][a-z+.-]*:/i.test(target) || target.startsWith('//');

const slugCache = new Map<string, Set<string>>();

const slugsOf = (file: string): Set<string> => {
  let slugs = slugCache.get(file);
  if (!slugs) {
    slugs = headingSlugs(fs.readFileSync(file, 'utf8'));
    slugCache.set(file, slugs);
  }
  return slugs;
};

export const checkDocLinks = (files: string[], repoRoot: string): LinkIssue[] => {
  const issues: LinkIssue[] = [];
  for (const file of files) {
    const absolute = path.join(repoRoot, file);
    for (const { target, line } of extractLinks(fs.readFileSync(absolute, 'utf8'))) {
      if (isExternal(target) || target === '') {
        continue;
      }
      const hash = target.indexOf('#');
      const targetPath = hash === -1 ? target : target.slice(0, hash);
      const fragment = hash === -1 ? undefined : target.slice(hash + 1);
      const resolved = targetPath === ''
        ? absolute
        : targetPath.startsWith('/')
          // Root-relative targets are repo-relative, not filesystem-absolute.
          ? path.join(repoRoot, targetPath)
          : path.resolve(path.dirname(absolute), targetPath);
      if (!fs.existsSync(resolved)) {
        issues.push({ file, line, message: `broken link: ${target}` });
        continue;
      }
      if (fragment === undefined) {
        continue;
      }
      // A second "#" inside the fragment can never match a slug; flag it even
      // on non-Markdown targets rather than silently truncating.
      if (fragment.includes('#')
        || (resolved.endsWith('.md') && !slugsOf(resolved).has(fragment))) {
        issues.push({ file, line, message: `broken anchor: ${target}` });
      }
    }
  }
  return issues;
};

// Temporal-status wording (docs/documentation.md invariant 4): spec prose is
// timeless. Conservative token list — only unambiguous status markers;
// "new" is semantic (feature-age vs domain use) and stays with review.
// docs/todo.md is the status ledger; docs/documentation.md quotes the banned
// tokens as rules; both are exempt.
const TEMPORAL = /\bfor now\b|\bcurrently\b|\bat the moment\b|\bnot yet\b|\bwill soon\b|\(early draft\)/i;
const TEMPORAL_EXEMPT = new Set(['docs/todo.md', 'docs/documentation.md']);

export const checkProse = (files: string[], repoRoot: string): LinkIssue[] => {
  const issues: LinkIssue[] = [];
  // Both prose rules apply to docs/ only. Skill files are exempt: their
  // References link sibling skills by design (see the invariants' preamble),
  // and the temporal check conservatively stays off them too.
  for (const file of files) {
    if (!file.startsWith('docs/')) {
      continue;
    }
    const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    const lines = stripCodeSegments(text).split('\n');
    if (!TEMPORAL_EXEMPT.has(file)) {
      lines.forEach((line, index) => {
        if (TEMPORAL.test(line)) {
          issues.push({ file, line: index + 1, message: `temporal-status wording: ${line.trim().slice(0, 60)}` });
        }
      });
    }
    // References shape (invariant 3): external sources only — no links into
    // the corpus collected there. Links (inline and reference-style) come
    // from extractLinks; "external" is isExternal, the same test the link
    // checker uses to skip a target.
    const inRefs: boolean[] = [];
    let refs = false;
    for (const line of lines) {
      if (/^##\s+References\b/.test(line)) {
        refs = true;
      } else if (/^##\s/.test(line)) {
        refs = false;
      }
      inRefs.push(refs);
    }
    for (const { target, line } of extractLinks(text)) {
      if (inRefs[line - 1] && !isExternal(target)) {
        issues.push({ file, line, message: 'internal link inside References (must be inline in the body)' });
      }
    }
  }
  return issues;
};

const main = (): void => {
  const repoRoot = process.cwd();
  // Normalize to repo-relative so ./docs/x.md and absolute paths behave.
  const files = process.argv.slice(2).map((f) => path.relative(repoRoot, path.resolve(f)));
  if (files.length === 0) {
    process.stderr.write('usage: check-doc-links.ts <file.md ...> (tools/lint-md.sh passes the repo selection)\n');
    process.exitCode = 1;
    return;
  }
  const issues = checkDocLinks(files, repoRoot);
  issues.push(...checkProse(files, repoRoot));
  for (const issue of issues) {
    process.stderr.write(`${issue.file}:${issue.line} ${issue.message}\n`);
  }
  if (issues.length > 0) {
    process.exitCode = 1;
  } else {
    process.stdout.write(`doc links ok (${files.length} files)\n`);
  }
};

// realpath both sides so a symlinked invocation still runs main().
const isDirectInvocation = (): boolean => {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isDirectInvocation()) {
  main();
}
