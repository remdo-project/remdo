// The two RemDo custom markdownlint rules, exercised through markdownlint's own
// lint API with fixture strings (happy / violation / exemption for each), plus
// two integration cases running the real cli2 over a *scratch fixture repo*
// wired with the production config + rules (a green tree, and a red tree that
// trips all three rules). The rules ride the micromark token stream, so code
// spans and fences are excluded for free — the fixtures assert that rather than
// re-testing parsing.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
// Resolvable re-export of markdownlint's promise API (markdownlint itself is a
// transitive dep under markdownlint-cli2, which is how production loads these
// rules).
import { lint } from 'markdownlint-cli2/markdownlint/promise';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTempDirs, git, makeDir } from '../../_shared/test-support/git-scratch';
import referencesShape from '../tools/lint-rules/references-shape.mjs';
import temporalStatus from '../tools/lint-rules/temporal-status.mjs';

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

  it('exempts by exact repo-relative path, not basename — a nested todo.md is in scope', async () => {
    expect(await temporal('docs/sub/todo.md', 'for now this lives here\n')).toEqual([1]);
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

  it('passes a reference-style external citation, resolving its definition target', async () => {
    // `[MDN][mdn]` carries no inline destination; its `[mdn]: url` definition is
    // the external target — neither the link nor the definition is flagged.
    const external = '## References\n\n- [MDN][mdn]\n\n[mdn]: https://developer.mozilla.org\n';
    expect(await references('docs/a.md', external)).toEqual([]);
    // A reference-style link whose in-section definition is internal: both the
    // link (resolved through the definition map, line 3) and the definition
    // (line 5) fail.
    const internal = '## References\n\n- [note][n]\n\n[n]: b.md\n';
    expect(await references('docs/a.md', internal)).toEqual([3, 5]);
  });

  it('flags a reference-style link whose internal definition sits outside References', async () => {
    // The `[n]: ./body.md` definition is above the section, so it is out of the
    // checked range — but the link inside References still resolves through it
    // and must be flagged (invariant 3: References may cite only external).
    const md = '[n]: ./body.md\n\nbody text\n\n## References\n\n- [note][n]\n';
    expect(await references('docs/a.md', md)).toEqual([7]);
  });

  it('resolves a duplicate-label reference to its first definition (internal), not a later external', async () => {
    // CommonMark resolves `[n]` to the FIRST `[n]:` definition. The first is
    // internal, so the link must be flagged even though a later duplicate is
    // external — the map must not let the last definition win.
    const md = '[n]: ./body.md\n\n## References\n\n- [note][n]\n\n[n]: https://x.y\n';
    expect(await references('docs/a.md', md)).toContain(5);
  });

  it('keeps a subsection inside the section (only the next level-2 heading closes it)', async () => {
    expect(await references('docs/a.md', '## References\n\n### Sub\n\n- [i](b.md)\n')).toEqual([5]);
    const closed = '## References\n\n- [e](https://x.y)\n\n## Other\n\n- [i](b.md)\n';
    expect(await references('docs/a.md', closed)).toEqual([]);
  });

});

// Integration: run the *real* cli2 (production config + custom rules) over a
// self-contained scratch repo, so the case is decoupled from the live working
// tree — an untracked draft in the actual repo can no longer flip it red. cli2
// resolves named rule deps (markdownlint-rule-relative-links) from its own
// package location, and the two `.mjs` rules resolve relative to the copied
// config, so a bare scratch dir with no node_modules is enough.
const require = createRequire(import.meta.url);
// The cli2 binary entry sits next to its resolved main module.
const cli2Bin = path.join(path.dirname(require.resolve('markdownlint-cli2')), 'markdownlint-cli2-bin.mjs');
const repoRoot = process.cwd();
const skillToolsDir = path.join(repoRoot, '.agents/skills/remdo-docs-align/tools');
const configFile = path.join(repoRoot, '.markdownlint-cli2.jsonc');

afterEach(cleanupTempDirs);

// Build a scratch git repo carrying the production cli2 config + custom rules
// and the given docs fixtures, then return the cli2 run over it.
function scratchDocs(docs: Record<string, string>) {
  const dir = makeDir('mdlint-scratch-');
  fs.copyFileSync(configFile, path.join(dir, '.markdownlint-cli2.jsonc'));
  for (const [rel, content] of Object.entries(docs)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  // git init so cli2's `gitignore: true` selection behaves as in production;
  // via the harness git() so it runs with isolated config + temp-root ceiling.
  git(dir, 'init', '--quiet');
  return dir;
}
// Product gate: real cli2 binary over the copied production config.
function lintProduct(dir: string) {
  return spawnSync('node', [cli2Bin], { cwd: dir, encoding: 'utf8' });
}
// Skill gate: the private node runner, spawned from the scratch repo but
// resolving its rules from the real skill tree (absolute path).
function lintSkill(dir: string) {
  return spawnSync('node', [path.join(skillToolsDir, 'run-doc-rules.mjs')], { cwd: dir, encoding: 'utf8' });
}

describe('gate integration over a scratch fixture repo', () => {
  it('both gates are green on a clean docs fixture', () => {
    const dir = scratchDocs({
      'docs/x.md': '# X\n\nA timeless sentence with an [inline](https://x.y) link.\n\n## References\n\n- [ext](https://x.y)\n',
    });
    const product = lintProduct(dir);
    expect(product.status, product.stdout + product.stderr).toBe(0);
    const skill = lintSkill(dir);
    expect(skill.status, skill.stdout + skill.stderr).toBe(0);
  }, 30_000);

  it('each gate is red on its own violation class', () => {
    // One file trips all three classes: a broken relative link (product
    // gate: relative-links), a "currently" temporal word and an internal
    // link inside a References section (skill gate: remdo-temporal-status,
    // remdo-references-shape). Each gate must catch its own classes — and
    // only its own.
    const dir = scratchDocs({
      'docs/x.md': '# X\n\nThis is currently broken.\n\nSee [missing](./nope.md) for details.\n\n## References\n\n- [internal](./y.md)\n',
    });
    const product = lintProduct(dir);
    expect(product.status).not.toBe(0);
    const productOut = product.stdout + product.stderr;
    expect(productOut).toContain('relative-links');
    expect(productOut).not.toContain('remdo-temporal-status');
    const skill = lintSkill(dir);
    expect(skill.status).not.toBe(0);
    const skillOut = skill.stdout + skill.stderr;
    expect(skillOut).toContain('remdo-temporal-status');
    expect(skillOut).toContain('remdo-references-shape');
    expect(skillOut).not.toContain('relative-links');
  }, 30_000);
});
