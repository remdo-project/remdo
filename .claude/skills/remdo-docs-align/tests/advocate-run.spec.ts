/* eslint-disable node/no-process-env */
// advocate-run.sh (skill-local tools/): argument/substitution/refusal logic only —
// codex is external, so it is stubbed via PATH. The script invokes codex with
// `--output-last-message <file>` (codex's clean channel) plus `-`; the stub
// parses that flag, writes the FINAL message to the file, and echoes noise to
// stdout (the full mixed stream the script captures to <out>.raw). The
// normalizer reads only the final-message file.
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

// A stub prelude that parses `-o <file>` (codex's --output-last-message) out of
// the args and exposes it as $MSG, and drains stdin into $PROMPT. The bodies
// below then write the final message to $MSG and echo whatever noise to stdout.
const PARSE_ARGS = [
  'MSG=""',
  'while [ "$#" -gt 0 ]; do',
  '  case "$1" in',
  '    -o|--output-last-message) MSG="$2"; shift 2 ;;',
  '    *) shift ;;',
  '  esac',
  'done',
  'PROMPT="$(cat)"',
].join('\n');

// The advocate's final-message payload for a normal run: a minimal valid
// proposal block (Text: + Replacement:), which the normalizer renders as one
// canonical numbered block.
const PROPOSAL = '1. `docs/config.md:18`\nText: "settable variables"\nReplacement: DELETE';

// Stub body: echo the prompt (so raw-stream assertions can inspect substitution)
// plus a reading-trace noise line to stdout, and write a minimal valid proposal
// to the final-message file. Used by cases that assert substitution/capture and
// must also clear the proposal check.
const echoPromptWriteProposal = `${PARSE_ARGS}\nprintf '%s\\n' "$PROMPT"; printf 'reading docs...\\n'; printf '%s\\n' '${PROPOSAL}' > "$MSG"`;

// Run advocate-run.sh from the real repo root with `codex` stubbed on PATH.
function run(args: string[], stub: string) {
  return runScript(path.join(__dirname, '../tools/advocate-run.sh'), repoRoot, args, stub);
}

afterEach(cleanupTempDirs);

describe('advocate-run.sh (skill-local tools/)', () => {
  it('substitutes {RULES_DOC}/{SCOPE} and captures the full codex stream', () => {
    const out = tempOut();
    const stub = stubDir(echoPromptWriteProposal);
    const result = run(['docs/documentation.md', 'docs/note-structure-rules.md', out], stub);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ADVOCATE=ok');
    expect(result.stdout).toContain('PROPOSALS=some');
    // Substitution reached the prompt; verified on the full raw stream (the stub
    // echoed the prompt there). The canonical table is the normalized final message.
    const raw = fs.readFileSync(`${out}.raw`, 'utf8');
    expect(raw).toContain('docs/documentation.md');
    expect(raw).toContain('docs/note-structure-rules.md');
    expect(raw).not.toContain('{RULES_DOC}');
    expect(raw).not.toContain('{SCOPE}');
    // Prompt body (not just the placeholders) reached codex — full, untruncated.
    expect(raw).toContain('DELETION ADVOCATE');
    // The raw stream also carries the reading-trace noise (it is the full stream).
    expect(raw).toContain('reading docs...');
    // The final-message capture holds only the agent's final message (no trace).
    const msg = fs.readFileSync(`${out}.msg`, 'utf8');
    expect(msg).not.toContain('reading docs...');
    expect(msg).not.toContain('DELETION ADVOCATE');
    // The canonical table holds only the renumbered proposal block.
    const captured = fs.readFileSync(out, 'utf8');
    expect(captured).toMatch(/^1\. file: docs\/config\.md:18/);
    expect(captured).not.toContain('DELETION ADVOCATE');
    expect(captured).toContain('Replacement: DELETE');
  });

  it('retries once when the first codex run produces no final message', () => {
    const out = tempOut();
    const counter = path.join(makeDir('advocate-cnt-'), 'n');
    // First call: exit 1 with no message file. Second call: succeed with content.
    const stub = stubDir(
      `${PARSE_ARGS}\n`
      + `cnt="${counter}"\n`
      + `if [ -f "$cnt" ]; then printf '%s\\n' '${PROPOSAL}' > "$MSG"; exit 0; else : > "$cnt"; exit 1; fi`,
    );
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RETRIED=1');
    expect(fs.readFileSync(out, 'utf8')).toContain('Replacement: DELETE');
  });

  it('retries when a clean codex exit leaves the final-message file empty', () => {
    const out = tempOut();
    const counter = path.join(makeDir('advocate-cnt-'), 'n');
    // First call: exit 0 but write nothing to $MSG (codex died before its final
    // turn). Second call: a real proposal. The empty-message guard must retry.
    const stub = stubDir(
      `${PARSE_ARGS}\n`
      + `cnt="${counter}"\n`
      + `if [ -f "$cnt" ]; then printf '%s\\n' '${PROPOSAL}' > "$MSG"; else : > "$cnt"; : > "$MSG"; fi\n`
      + 'exit 0',
    );
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RETRIED=1');
    expect(fs.readFileSync(out, 'utf8')).toContain('Replacement: DELETE');
  });

  it('fails loud when codex fails on both attempts', () => {
    const out = tempOut();
    const stub = stubDir(`${PARSE_ARGS}\nexit 3`); // always fails, no message
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('after one retry');
    // The failure points at the full stream for diagnosis.
    expect(result.stderr).toContain('.raw');
  });

  it('normalizes a multi-proposal final message into the canonical renumbered table', () => {
    const out = tempOut();
    // The advocate's final message: two proposals, one using the legacy Quote:
    // label. The normalizer renumbers, canonicalizes Quote:→Text:, and keeps
    // each block's Replacement: line.
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
    const fixture = path.join(makeDir('advocate-multi-'), 'answer.txt');
    fs.writeFileSync(fixture, `${answer}\n`);
    const stub = stubDir(`${PARSE_ARGS}\nprintf 'noise\\n'; cat "${fixture}" > "$MSG"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ADVOCATE=ok');
    const captured = fs.readFileSync(out, 'utf8');
    // Each proposal (and its Replacement line) appears exactly once, in
    // canonical renumbered form (Quote: label canonicalized to Text:).
    expect(captured.match(/Replacement:/g)).toHaveLength(2);
    expect(captured.match(/1\. file: docs\/config\.md:18/g)).toHaveLength(1);
    expect(captured.match(/2\. file: docs\/config\.md:58/g)).toHaveLength(1);
    expect(captured.match(/Text: /g)).toHaveLength(2);
  });

  it('keeps a Borderline: label through normalization', () => {
    const out = tempOut();
    const answer = [
      '1. `docs/config.md:18`',
      'Text: "settable variables"',
      'Replacement: DELETE',
      'Borderline: the adjacent table may not be exhaustive.',
    ].join('\n');
    const fixture = path.join(makeDir('advocate-bl-'), 'answer.txt');
    fs.writeFileSync(fixture, `${answer}\n`);
    const stub = stubDir(`${PARSE_ARGS}\ncat "${fixture}" > "$MSG"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).toBe(0);
    const captured = fs.readFileSync(out, 'utf8');
    expect(captured).toContain('Borderline: the adjacent table may not be exhaustive.');
  });

  // A codex session that dies mid-read leaves a reading trace with no numbered
  // proposal in its final message. Both attempts produce such output → fail non-zero.
  it('fails loud when both attempts produce neither proposals nor the sentinel', () => {
    const out = tempOut();
    // Non-empty final message, but no proposal block and no sentinel — a truncated trace.
    const stub = stubDir(`${PARSE_ARGS}\nprintf 'I am reading docs/config.md...\\nstill reading...\\n' > "$MSG"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('neither proposals nor a NO PROPOSALS sentinel');
  });

  it('rejects a final message with a Replacement: label but no proposal block', () => {
    const out = tempOut();
    // A noncompliant message quotes the `Replacement:` label from the format
    // spec but carries no location-anchored/Text: block — not a real proposal.
    // (No head line is minted because there is no location line to anchor it.)
    const stub = stubDir(`${PARSE_ARGS}\nprintf 'Use the label Replacement: verbatim.\\nStill reading...\\n' > "$MSG"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('neither proposals nor a NO PROPOSALS sentinel');
  });

  it('accepts a NO PROPOSALS sentinel as a clean no-op (PROPOSALS=none)', () => {
    const out = tempOut();
    // A minimal scope: the advocate legitimately finds nothing and emits the sentinel.
    const stub = stubDir(`${PARSE_ARGS}\nprintf 'NO PROPOSALS\\n' > "$MSG"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ADVOCATE=ok');
    expect(result.stdout).toContain('PROPOSALS=none');
    expect(fs.readFileSync(out, 'utf8').trim()).toBe('NO PROPOSALS');
  });

  // Mixed trace: the final message carries BOTH the NO PROPOSALS sentinel line
  // and real proposal blocks. Blocks win; PROPOSALS=some, plus a stderr warning.
  it('prefers proposal blocks over a co-occurring NO PROPOSALS sentinel, warning on stderr', () => {
    const out = tempOut();
    const answer = [
      'NO PROPOSALS',
      '',
      '1. `docs/config.md:18`',
      'Text: "settable variables"',
      'Replacement: DELETE',
    ].join('\n');
    const fixture = path.join(makeDir('advocate-mix-'), 'answer.txt');
    fs.writeFileSync(fixture, `${answer}\n`);
    const stub = stubDir(`${PARSE_ARGS}\ncat "${fixture}" > "$MSG"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PROPOSALS=some');
    expect(result.stderr).toContain('NO PROPOSALS sentinel appeared alongside');
    const captured = fs.readFileSync(out, 'utf8');
    expect(captured).toMatch(/^1\. file: docs\/config\.md:18/m);
    expect(captured).not.toMatch(/^NO PROPOSALS$/m);
  });

  // Truncated block: a head + Text: but no Replacement:. It is not a valid
  // proposal (needs both), so with no other block both attempts must fail non-zero.
  it('fails loud on a truncated block with Text: but no Replacement:', () => {
    const out = tempOut();
    const answer = ['1. `docs/config.md:18`', 'Text: "settable variables"'].join('\n');
    const stub = stubDir(`${PARSE_ARGS}\nprintf '%s\\n' '${answer}' > "$MSG"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('neither proposals nor a NO PROPOSALS sentinel');
  });

  // No blank line separating two proposal blocks: both must still be extracted,
  // renumbered, with their values uncorrupted (the location-line flush splits them).
  it('splits back-to-back proposal blocks with no blank separator', () => {
    const out = tempOut();
    const answer = [
      '1. `docs/config.md:18`',
      'Text: "settable variables"',
      'Replacement: DELETE',
      '2. `docs/config.md:58`',
      'Text: "is normal, not a misconfiguration."',
      'Replacement: DELETE',
    ].join('\n');
    const stub = stubDir(`${PARSE_ARGS}\nprintf '%s\\n' '${answer}' > "$MSG"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).toBe(0);
    const captured = fs.readFileSync(out, 'utf8');
    expect(captured.match(/^1\. file: docs\/config\.md:18/m)).toHaveLength(1);
    expect(captured.match(/^2\. file: docs\/config\.md:58/m)).toHaveLength(1);
    expect(captured).toContain('Text: "settable variables"');
    expect(captured).toContain('Text: "is normal, not a misconfiguration."');
    expect(captured.match(/Replacement:/g)).toHaveLength(2);
  });

  // A missing-Text: block mid-table (only a location line + Replacement:) must
  // NOT silently vanish: the location line head-mints a block, so both proposals
  // survive in the canonical table.
  it('head-mints a missing-Text: block from its location line rather than dropping it', () => {
    const out = tempOut();
    const answer = [
      '1. `docs/config.md:18`',
      'Replacement: DELETE',
      '',
      '2. `docs/config.md:58`',
      'Text: "is normal, not a misconfiguration."',
      'Replacement: DELETE',
    ].join('\n');
    const stub = stubDir(`${PARSE_ARGS}\nprintf '%s\\n' '${answer}' > "$MSG"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).toBe(0);
    const captured = fs.readFileSync(out, 'utf8');
    // Both blocks present (the missing-Text one head-minted from its location).
    expect(captured.match(/^1\. file: docs\/config\.md:18/m)).toHaveLength(1);
    expect(captured.match(/^2\. file: docs\/config\.md:58/m)).toHaveLength(1);
    expect(captured.match(/Replacement:/g)).toHaveLength(2);
  });

  it('creates the output parent directory when it does not exist', () => {
    // A repo-local output path whose parent has not been created (the fresh
    // worktree case, e.g. a not-yet-created .agent/tmp/); the script must make
    // it rather than fail the capture redirect and misreport an advocate error.
    const out = path.join(makeDir('advocate-mkdir-'), 'nested', 'dir', 'proposal.md');
    const stub = stubDir(echoPromptWriteProposal);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ADVOCATE=ok');
    expect(fs.existsSync(out)).toBe(true);
  });

  it('splices a scope containing & literally (no gsub replacement semantics)', () => {
    const out = tempOut();
    const stub = stubDir(echoPromptWriteProposal);
    // `&` is awk gsub's "matched text" metacharacter; a literal splice must keep
    // it verbatim rather than expanding it to the placeholder text.
    const result = run(['docs/documentation.md', 'files A & B', out], stub);
    expect(result.status).toBe(0);
    const raw = fs.readFileSync(`${out}.raw`, 'utf8');
    expect(raw).toContain('files A & B');
    expect(raw).not.toContain('{SCOPE}');
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

  it('does not reuse a stale final-message file from a previous run', () => {
    const out = tempOut();
    // Seed a stale .msg from a "previous run"; the stub exits 0 without
    // writing a new one — the script must fail/retry, not normalize the relic.
    fs.writeFileSync(`${out}.msg`, '1. `docs/old.md:1`\nText: "stale"\nReplacement: DELETE\n');
    const stub = stubDir(`${PARSE_ARGS}\nexit 0`); // parses args, writes no message
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).not.toBe(0);
  });

  it('rejects a final message whose labels have no location-shaped line', () => {
    const out = tempOut();
    const fixture = path.join(makeDir('advocate-noloc-'), 'msg.txt');
    fs.writeFileSync(fixture, 'I found one proposal:\nText: "some quote"\nReplacement: DELETE\n');
    const stub = stubDir(`${PARSE_ARGS}\ncat "${fixture}" > "$MSG"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    // No location-shaped line anywhere: no block minted, validation fails loud.
    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(out, 'utf8')).not.toContain('I found one proposal');
  });

  it('a blank line between the location and Text: yields exactly one block', () => {
    const out = tempOut();
    const fixture = path.join(makeDir('advocate-blank-'), 'msg.txt');
    fs.writeFileSync(fixture, '1. `docs/config.md:18`\n\nText: "settable variables"\nReplacement: DELETE\n');
    const stub = stubDir(`${PARSE_ARGS}\ncat "${fixture}" > "$MSG"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const captured = fs.readFileSync(out, 'utf8');
    expect(captured.match(/^\d+\. file: /gm)).toHaveLength(1);
    expect(captured.match(/Text: /g)).toHaveLength(1);
  });

  it('resolves a relative output path against the caller cwd', () => {
    const dir = makeDir('advocate-relcwd-');
    const stub = stubDir(echoPromptWriteProposal);
    const result = runScript(path.join(__dirname, '../tools/advocate-run.sh'), dir, ['docs/documentation.md', 'scope', 'rel-out.md'], stub);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(fs.existsSync(path.join(dir, 'rel-out.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'rel-out.md.raw'))).toBe(true);
  });

  it('numbered prose does not mint a location row', () => {
    const out = tempOut();
    const fixture = path.join(makeDir('advocate-prose-'), 'msg.txt');
    fs.writeFileSync(fixture, '1. I found one issue:\nText: "some quote"\nReplacement: DELETE\n');
    const stub = stubDir(`${PARSE_ARGS}\ncat "${fixture}" > "$MSG"`);
    const result = run(['docs/documentation.md', 'scope', out], stub);
    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(out, 'utf8')).not.toContain('I found one issue');
  });
});
