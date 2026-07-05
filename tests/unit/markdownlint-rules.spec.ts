/* eslint-disable node/no-process-env */
// The two RemDo custom markdownlint rules, exercised through markdownlint's own
// lint API with fixture strings (happy / violation / exemption for each), plus
// one integration case running the real `pnpm run lint:md` and expecting green.
// The rules ride the micromark token stream, so code spans and fences are
// excluded for free — the fixtures assert that rather than re-testing parsing.
import { spawnSync } from 'node:child_process';
import process from 'node:process';
// Resolvable re-export of markdownlint's promise API (markdownlint itself is a
// transitive dep under markdownlint-cli2, which is how production loads these
// rules).
import { lint } from 'markdownlint-cli2/markdownlint/promise';
import { describe, expect, it } from 'vitest';
import referencesShape from '../../tools/markdownlint-rules/references-shape.mjs';
import temporalStatus from '../../tools/markdownlint-rules/temporal-status.mjs';

// Lint one fixture string under `name` with the given custom rule and return the
// violation lines (empty when clean). `default: false` isolates the rule.
async function violations(
  rule: unknown,
  ruleName: string,
  name: string,
  content: string,
): Promise<number[]> {
  const results = await lint({
    strings: { [name]: content },
    customRules: [rule],
    config: { default: false, [ruleName]: true },
  });
  return results[name]!.map((error) => error.lineNumber);
}

const temporal = (name: string, content: string) =>
  violations(temporalStatus, 'remdo-temporal-status', name, content);
const references = (name: string, content: string) =>
  violations(referencesShape, 'remdo-references-shape', name, content);

describe('remdo-temporal-status', () => {
  it('flags each banned token in docs prose', async () => {
    const md = 'Supported for now.\ncurrently active\nat the moment true\nnot yet done\nwill soon ship\n(early draft) note\n';
    expect(await temporal('docs/a.md', md)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('does not fire inside code spans or fenced blocks', async () => {
    expect(await temporal('docs/a.md', 'Use `currently` here.\n\n```\nfor now this is code\n```\n')).toEqual([]);
  });

  it('exempts docs/todo.md and docs/documentation.md', async () => {
    expect(await temporal('docs/todo.md', 'for now this lives here\n')).toEqual([]);
    expect(await temporal('docs/documentation.md', 'the banned token "currently"\n')).toEqual([]);
  });

  it('applies to docs/ only — skill files are exempt', async () => {
    expect(await temporal('.claude/skills/s/SKILL.md', 'currently supported\n')).toEqual([]);
  });
});

describe('remdo-references-shape', () => {
  it('flags an internal link inside a docs References section', async () => {
    const md = 'body [inline](b.md)\n\n## References\n\n- [internal](b.md)\n- [ext](https://x.y)\n';
    expect(await references('docs/a.md', md)).toEqual([5]);
  });

  it('accepts angle-bracket, space-leading, and protocol-relative external forms', async () => {
    const md = '## References\n\n- [a](<https://x.y/a b>)\n- [b]( https://x.y/c )\n- [proto](//cdn.x/y)\n';
    expect(await references('docs/a.md', md)).toEqual([]);
  });

  it('flags a reference-style internal definition inside References', async () => {
    expect(await references('docs/a.md', '## References\n\n[def]: b.md\n')).toEqual([3]);
  });

  it('keeps a subsection inside the section (only the next level-2 heading closes it)', async () => {
    expect(await references('docs/a.md', '## References\n\n### Sub\n\n- [i](b.md)\n')).toEqual([5]);
    const closed = '## References\n\n- [e](https://x.y)\n\n## Other\n\n- [i](b.md)\n';
    expect(await references('docs/a.md', closed)).toEqual([]);
  });

  it('applies to docs/ only — skill files are exempt', async () => {
    expect(await references('.claude/skills/s/SKILL.md', '## References\n\n- [i](b.md)\n')).toEqual([]);
  });
});

describe('pnpm run lint:md', () => {
  // Spawns the real linter over the whole corpus, so it is far slower than the
  // in-process rule cases; give it room beyond vitest's 5s default.
  it('is green on the current corpus', () => {
    const result = spawnSync('pnpm', ['run', 'lint:md'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, TEST_TIMEOUT: '120' },
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  }, 60_000);
});
