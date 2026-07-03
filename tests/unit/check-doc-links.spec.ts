import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkDocLinks,
  checkMap,
  checkProse,
  extractLinks,
  headingSlugs,
  stripCodeSegments,
} from '../../tools/check-doc-links';

const tempDirs: string[] = [];

function makeRepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-links-'));
  tempDirs.push(root);
  for (const [file, content] of Object.entries(files)) {
    const absolute = path.join(root, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('stripCodeSegments', () => {
  it('blanks fenced blocks and inline code, preserving line count', () => {
    const md = 'a\n```\n[hidden](gone.md)\n```\nuse `[not a link](x.md)` here';
    const stripped = stripCodeSegments(md);
    expect(stripped.split('\n')).toHaveLength(5);
    expect(stripped).not.toContain('gone.md');
    expect(stripped).not.toContain('x.md');
    expect(stripped).toContain('use');
  });
});

describe('extractLinks', () => {
  it('finds inline links, titled links, and reference definitions with line numbers', () => {
    const md = '[a](one.md)\n![img](img.png "title")\n[ref]: two.md#part\nsee [b](<spaced path.md>)';
    expect(extractLinks(md)).toEqual([
      { target: 'one.md', line: 1 },
      { target: 'img.png', line: 2 },
      { target: 'two.md#part', line: 3 },
      { target: 'spaced path.md', line: 4 },
    ]);
  });
});

describe('headingSlugs', () => {
  it('slugs GitHub-style with punctuation dropped and duplicates suffixed', () => {
    const slugs = headingSlugs('# Pre-1.0 Policy!\n## Setup\n## Setup\n## The `code` [link](x.md)');
    expect(slugs).toEqual(new Set(['pre-10-policy', 'setup', 'setup-1', 'the-code-link']));
  });
});

describe('checkDocLinks', () => {
  it('reports missing files and anchors, resolves valid links and fragments', () => {
    const root = makeRepo({
      'docs/a.md': '[ok](b.md#section-one)\n[gone](c.md)\n[bad](b.md#nope)\n[self](#local)\n[selfbad](#missing)\n\n# Local\n',
      'docs/b.md': '# Section One\n',
    });
    const issues = checkDocLinks(['docs/a.md', 'docs/b.md'], root);
    expect(issues).toEqual([
      { file: 'docs/a.md', line: 2, message: 'broken link: c.md' },
      { file: 'docs/a.md', line: 3, message: 'broken anchor: b.md#nope' },
      { file: 'docs/a.md', line: 5, message: 'broken anchor: #missing' },
    ]);
  });

  it('skips external links', () => {
    const root = makeRepo({ 'docs/a.md': '[x](https://example.org/y)\n[m](mailto:a@b.c)\n' });
    expect(checkDocLinks(['docs/a.md'], root)).toEqual([]);
  });
});

describe('checkMap', () => {
  it('flags docs missing from the map and map entries without files', () => {
    const root = makeRepo({
      'docs/index.md': 'Map:\n- `docs/a.md` entry\n- `docs/phantom.md` entry\n',
      'docs/a.md': 'x\n',
      'docs/b.md': 'x\n',
    });
    const issues = checkMap('docs/index.md', ['docs/a.md', 'docs/b.md', 'docs/index.md'], root);
    expect(issues).toContainEqual({ file: 'docs/index.md', line: 1, message: 'doc missing from the map: docs/b.md' });
    expect(issues).toContainEqual({ file: 'docs/index.md', line: 3, message: 'map names a missing doc: docs/phantom.md' });
  });
});

describe('checkProse', () => {
  it('flags temporal-status wording in docs but not in the exempt files', () => {
    const root = makeRepo({
      'docs/a.md': 'This is supported for now.\n',
      'docs/todo.md': 'for now this lives here\n',
      'docs/documentation.md': 'no temporal status like "currently", "for now"\n',
    });
    const issues = checkProse(['docs/a.md', 'docs/todo.md', 'docs/documentation.md'], root);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.file).toBe('docs/a.md');
  });

  it('flags internal links inside a docs References section but not in skills', () => {
    const doc = 'body [inline](b.md)\n\n## References\n\n- [internal](b.md)\n- [ext](https://x.y)\n';
    const root = makeRepo({ 'docs/a.md': doc, '.claude/skills/s/SKILL.md': doc, 'docs/b.md': 'x\n' });
    const issues = checkProse(['docs/a.md', '.claude/skills/s/SKILL.md'], root);
    expect(issues).toEqual([
      { file: 'docs/a.md', line: 5, message: 'internal link inside References (must be inline in the body)' },
    ]);
  });
});
