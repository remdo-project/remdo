// Doc link checker: every relative link in a Markdown file the repo tracks
// (plus new untracked, not-gitignored ones — same git-based selection as
// tools/lint-md.sh) must resolve on disk, and a `#fragment` into a Markdown
// target must match a heading slug of that target. External (scheme) links are
// out of scope: checking them needs the network, and they are References-style
// background, not corpus structure. Prose rules (temporal-status wording,
// References shape) are covered by checkProse below.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export interface LinkIssue {
  file: string;
  line: number;
  message: string;
}

// Blank fenced code blocks and inline code spans (preserving line count and
// per-line offsets) so links and headings inside examples are never checked —
// skill files quote whole Markdown snippets in fences.
export const stripCodeSegments = (md: string): string => {
  const lines = md.split('\n');
  let fence: string | null = null;
  const stripped = lines.map((line) => {
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (open && open[1]!.startsWith(fence[0]!) && open[1]!.length >= fence.length) {
        fence = null;
      }
      return '';
    }
    if (open) {
      fence = open[1]!;
      return '';
    }
    // Inline code spans; longer backtick runs first so `` a`b `` stays whole.
    return line.replace(/(`+)[^`]*\1/g, (span) => ' '.repeat(span.length));
  });
  return stripped.join('\n');
};

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

// GitHub-style heading slugs: lowercase, markdown/link syntax dropped,
// non-word characters removed, spaces to hyphens, duplicates suffixed -1, -2…
export const headingSlugs = (md: string): Set<string> => {
  const slugs = new Set<string>();
  const seen = new Map<string, number>();
  for (const line of md.split('\n')) {
    const heading = /^#{1,6} +(\S.*)$/.exec(line.trim());
    if (!heading) {
      continue;
    }
    const text = heading[1]!
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '');
    const base = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s+/g, '-');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
};

const isExternal = (target: string): boolean =>
  /^[a-z][a-z+.-]*:/i.test(target) || target.startsWith('//');

const slugCache = new Map<string, Set<string>>();

const slugsOf = (file: string): Set<string> => {
  let slugs = slugCache.get(file);
  if (!slugs) {
    slugs = headingSlugs(stripCodeSegments(fs.readFileSync(file, 'utf8')));
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
      const [targetPath, fragment] = target.split('#', 2) as [string, string?];
      const resolved = targetPath === '' ? absolute : path.resolve(path.dirname(absolute), targetPath);
      if (!fs.existsSync(resolved)) {
        issues.push({ file, line, message: `broken link: ${target}` });
        continue;
      }
      if (fragment !== undefined && resolved.endsWith('.md') && !slugsOf(resolved).has(fragment)) {
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
  for (const file of files) {
    const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    const lines = stripCodeSegments(text).split('\n');
    if (file.startsWith('docs/') && !TEMPORAL_EXEMPT.has(file)) {
      lines.forEach((line, index) => {
        if (TEMPORAL.test(line)) {
          issues.push({ file, line: index + 1, message: `temporal-status wording: ${line.trim().slice(0, 60)}` });
        }
      });
    }
    // References shape (invariant 3): external sources only — no links into
    // the corpus collected there. Skill files are exempt: their References
    // link sibling skills by design (see the invariants' preamble).
    if (!file.startsWith('docs/')) {
      continue;
    }
    let inRefs = false;
    lines.forEach((line, index) => {
      if (/^##\s+References\b/.test(line)) { inRefs = true; return; }
      if (/^##\s/.test(line)) { inRefs = false; return; }
      if (inRefs && /\]\((?!https?:|mailto:)[^)]+\)/.test(line)) {
        issues.push({ file, line: index + 1, message: 'internal link inside References (must be inline in the body)' });
      }
    });
  }
  return issues;
};

const listMarkdownFiles = (repoRoot: string): string[] => {
  const run = (args: string[]): string[] =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  const files = new Set([
    ...run(['ls-files', '-z', '*.md']),
    ...run(['ls-files', '-z', '--others', '--exclude-standard', '*.md']),
  ]);
  return [...files].filter((file) => fs.existsSync(path.join(repoRoot, file))).sort();
};

const main = (): void => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = listMarkdownFiles(repoRoot);
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
