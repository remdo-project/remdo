/* eslint-disable node/no-process-env */
// advocate-run.sh (skill-local tools/): argument/substitution/refusal logic only —
// codex is external, so it is stubbed via PATH. The stub echoes the prompt it
// received on stdin, letting us assert placeholder substitution and capture.
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTempDirs, makeDir, runScript } from '../../_shared/test-support/git-scratch';

const repoRoot = process.cwd();
const advocateScript = path.join(__dirname, '../tools/advocate-run.sh');

function tempOut(): string {
  return path.join(makeDir('advocate-out-'), 'proposal.md');
}

// A PATH dir containing an executable `codex` stub. `body` is the stub's shell
// body (after the shebang); an optional counter file lets it behave differently
// per invocation for the retry test.
function stubDir(body: string): string {
  const dir = makeDir('advocate-stub-');
  const stub = path.join(dir, 'codex');
  fs.writeFileSync(stub, `#!/usr/bin/env sh\n${body}\n`, { mode: 0o755 });
  return dir;
}

// A minimal valid proposal block appended after the echoed prompt so the
// artifact passes the script's "at least one numbered proposal" check while the
// substitution/capture assertions still see the full prompt.
const PROPOSAL = '\n1. `docs/config.md:18`\nReplacement: DELETE\n';

// Stub body: echo the prompt read on stdin, then a minimal valid proposal. Used
// by the cases that assert substitution/capture (they inspect the echoed prompt)
// and must also clear the proposal check.
const echoPromptThenProposal = `cat; printf '%s' '${PROPOSAL}'`;

// Run advocate-run.sh from the real repo root with `codex` stubbed on PATH.
function run(args: string[], stub: string) {
  return runScript(path.join(__dirname, '../tools/advocate-run.sh'), repoRoot, args, stub);
}

afterEach(cleanupTempDirs);

describe('advocate-run.sh (skill-local tools/)', () => {
  it('substitutes {RULES_DOC}/{SCOPE} and captures the full codex output', () => {
    const out = tempOut();
    // Stub echoes back the prompt it read on stdin, plus a minimal proposal.
    const stub = stubDir(echoPromptThenProposal);
    const result = run(['docs/documentation.md', 'docs/note-structure-rules.md', out], stub);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ADVOCATE=ok');
    expect(result.stdout).toContain('PROPOSALS=some');
    const captured = fs.readFileSync(out, 'utf8');
    // Placeholders replaced with the passed values, none left literal.
    expect(captured).toContain('docs/documentation.md');
    expect(captured).toContain('docs/note-structure-rules.md');
    expect(captured).not.toContain('{RULES_DOC}');
    expect(captured).not.toContain('{SCOPE}');
    // Prompt body (not just the placeholders) reached codex — full, untruncated.
    expect(captured).toContain('DELETION ADVOCATE');
  });

  it('retries once when the first codex run produces no output', () => {
    const out = tempOut();
    const counter = path.join(makeDir('advocate-cnt-'), 'n');
    // First call: exit 1 with empty stdout. Second call: succeed with content.
    const stub = stubDir(
      `cnt="${counter}"\n`
      + `if [ -f "$cnt" ]; then ${echoPromptThenProposal}; exit 0; else : > "$cnt"; exit 1; fi`,
    );
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RETRIED=1');
    expect(fs.readFileSync(out, 'utf8')).toContain('DELETION ADVOCATE');
  });

  it('fails loud when codex fails on both attempts', () => {
    const out = tempOut();
    const stub = stubDir('exit 3'); // always fails, empty output
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('after one retry');
  });

  // codex streams its final numbered answer, then reprints it verbatim after a
  // "tokens used\n<count>" marker (observed 2/2 in baseline runs). The script
  // must collapse the byte-identical repeat to a single copy.
  it('de-duplicates the doubled final answer, keeping the proposal list once', () => {
    const out = tempOut();
    const answer = [
      'I read every doc. Proposals:',
      '',
      '1. `docs/config.md:18`',
      'Quote: "These are the only settable variables."',
      'Replacement: DELETE',
      'Rule: adjacent exhaustive table already establishes the set.',
      'Risk test: an unlisted var is treated as settable; the table still forbids it.',
      '',
      '2. `docs/config.md:58`',
      'Quote: "is normal, not a misconfiguration."',
      'Replacement: DELETE',
      'Rule: rationale beyond the rule.',
      'Risk test: maintainers reintroduce the removed setting.',
    ].join('\n');
    // A fixture holding the answer, the "tokens used\n<count>" marker, then the
    // answer again — the exact doubling the script collapses. The stub cats it.
    const fixture = path.join(makeDir('advocate-dup-'), 'doubled.txt');
    fs.writeFileSync(fixture, `${answer}\ntokens used\n42\n${answer}\n`);
    const stub = stubDir(`cat "${fixture}"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ADVOCATE=ok');
    const captured = fs.readFileSync(out, 'utf8');
    // Each proposal (and its Replacement line) appears exactly once.
    expect(captured.match(/Replacement:/g)).toHaveLength(2);
    expect(captured.match(/1\. `docs\/config\.md:18`/g)).toHaveLength(1);
    // The redundant "tokens used" marker (and the reprint after it) is gone.
    expect(captured).not.toContain('tokens used');
  });

  // A codex session that dies mid-read leaves a reading trace with no numbered
  // proposal. Both attempts produce such output → the run must fail non-zero.
  it('fails loud when both attempts produce neither proposals nor the sentinel', () => {
    const out = tempOut();
    // Non-empty output, but no "Replacement:" line and no sentinel — a truncated trace.
    const stub = stubDir('printf "I am reading docs/config.md...\\nstill reading...\\n"');
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('neither proposals nor a NO PROPOSALS sentinel');
  });

  it('accepts a NO PROPOSALS sentinel as a clean no-op (PROPOSALS=none)', () => {
    const out = tempOut();
    // A minimal scope: the advocate legitimately finds nothing and emits the sentinel.
    const stub = stubDir('printf "NO PROPOSALS\\n"');
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ADVOCATE=ok');
    expect(result.stdout).toContain('PROPOSALS=none');
  });

  it('creates the output parent directory when it does not exist', () => {
    // A repo-local output path whose parent has not been created (the fresh
    // worktree case, e.g. a not-yet-created .agent/tmp/); the script must make
    // it rather than fail the capture redirect and misreport an advocate error.
    const out = path.join(makeDir('advocate-mkdir-'), 'nested', 'dir', 'proposal.md');
    const stub = stubDir(echoPromptThenProposal);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ADVOCATE=ok');
    expect(fs.existsSync(out)).toBe(true);
  });

  it('splices a scope containing & literally (no gsub replacement semantics)', () => {
    const out = tempOut();
    const stub = stubDir(echoPromptThenProposal);
    // `&` is awk gsub's "matched text" metacharacter; a literal splice must keep
    // it verbatim rather than expanding it to the placeholder text.
    const result = run(['docs/documentation.md', 'files A & B', out], stub);
    expect(result.status).toBe(0);
    const captured = fs.readFileSync(out, 'utf8');
    expect(captured).toContain('files A & B');
    expect(captured).not.toContain('{SCOPE}');
  });

  it('refuses a fourth argument', () => {
    const result = run(['docs/documentation.md', 'scope', tempOut(), 'extra'], stubDir('cat'));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('expected exactly 3 arguments');
  });

  it('refuses a missing rules doc', () => {
    const result = run([], stubDir('cat'));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('missing rules doc');
  });

  it('refuses a missing scope', () => {
    const result = run(['docs/documentation.md'], stubDir('cat'));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('missing scope');
  });

  it('refuses a missing output file', () => {
    const result = run(['docs/documentation.md', 'scope'], stubDir('cat'));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('missing output file');
  });

  it('fails loud when the advocate template is absent', () => {
    // Copy the script into a bare temp dir so its repo-relative template path
    // resolves to a missing file — exercising the template-not-found refusal.
    const isolated = makeDir('advocate-notmpl-');
    const copy = path.join(isolated, 'advocate-run.sh');
    fs.copyFileSync(advocateScript, copy);
    const out = tempOut();
    const result = runScript(copy, isolated, ['docs/documentation.md', 'scope', out], stubDir('cat'));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('template not found');
  });
});
