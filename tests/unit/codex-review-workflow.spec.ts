import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const workflow = parse(readFileSync('.github/workflows/codex-review.yml', 'utf8')) as {
  jobs: { 'codex-review': { steps: [{ run: string }] } };
};
const script = workflow.jobs['codex-review'].steps[0].run;
const completed = '2026-10-02T12:00:00Z';
const codex = 'chatgpt-codex-connector[bot]';

const fakeGh = String.raw`
import { readFileSync } from 'node:fs';
const state = JSON.parse(readFileSync(process.env.CODEX_REVIEW_STATE, 'utf8'));
const [command, url, ...args] = process.argv.slice(2);
const route = url.split('?')[0];
const evidence = route.match(/\/issues\/(\d+)\/(comments|reactions)$/);
if (command !== 'api' || !evidence || Number(evidence[1]) !== state.prNumber) {
  throw new Error('Unexpected API route: ' + route);
}
if (state.apiError && route.includes(state.apiError)) {
  process.stderr.write('gh: API refused (HTTP 403)\n');
  process.exit(1);
}
const frame = state.frames[Math.min(state.attempt, state.frames.length - 1)];
const items = frame[evidence[2]];
const pages = items.length > 1 ? [items.slice(0, 1), items.slice(1)] : [items];
for (const page of args.includes('--paginate') ? pages : pages.slice(0, 1)) {
  process.stdout.write(JSON.stringify(page) + '\n');
}
`;

// Each fake sleep advances the evidence fixture without waiting on wall-clock time.
const fakeSleep = String.raw`#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == 30 ]]
jq '.attempt += 1' "$CODEX_REVIEW_STATE" > "$CODEX_REVIEW_STATE.next"
mv "$CODEX_REVIEW_STATE.next" "$CODEX_REVIEW_STATE"
`;

function fixture() {
  const review = {
    comments: [{
      user: { login: codex },
      updated_at: '2026-10-02T12:00:05Z',
      body: `<!-- codex-pull-request-review-summary -->\n| 📝 **Code Review** | ✅ **Completed** <relative-time datetime="${completed}">done</relative-time> | \`0123456\` |`,
    }],
    reactions: [{ user: { login: codex }, content: '+1', created_at: '2026-10-02T12:00:02Z' }],
  };
  const state = { prNumber: 17, head: '0123456789abcdef', frames: [review], attempt: 0, apiError: '' };
  function evaluate() {
    const dir = mkdtempSync(join(tmpdir(), 'remdo-codex-review-'));
    try {
      const stateFile = join(dir, 'state.json');
      writeFileSync(stateFile, JSON.stringify(state));
      writeFileSync(join(dir, 'gh'), `#!${process.execPath}\n${fakeGh}`, { mode: 0o755 });
      writeFileSync(join(dir, 'sleep'), fakeSleep, { mode: 0o755 });
      const result = spawnSync('bash', ['-c', script], {
        encoding: 'utf8', timeout: 10_000,
        env: {
          // eslint-disable-next-line node/no-process-env
          ...process.env, PATH: `${dir}:${process.env.PATH}`,
          GITHUB_REPOSITORY: 'remdo-project/remdo', GH_TOKEN: 'test-only',
          PR_NUMBER: String(state.prNumber), HEAD_SHA: state.head, CODEX_REVIEW_STATE: stateFile,
        },
      });
      state.attempt = JSON.parse(readFileSync(stateFile, 'utf8')).attempt;
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return { state, review, evaluate };
}

describe('codex review job', () => {
  it('waits for review completion and a delayed clean reaction before succeeding', () => {
    const { state, review, evaluate } = fixture();
    state.frames = [
      { comments: [], reactions: [] },
      { ...review, reactions: [] },
      review,
    ];
    expect(evaluate()).toContain('Clean Codex review completed for 0123456789abcdef.');
    expect(state.attempt).toBe(2);
  });

  it('times out instead of combining an old completed row with an in-progress review of the head', () => {
    const { review, evaluate } = fixture();
    const oldRow = review.comments[0]!.body.replace('`0123456`', '`abcdef0`');
    review.comments[0]!.body = `${oldRow}\n| 📝 **Code Review** | ⏳ **In Progress** | \`0123456\` |`;
    expect(evaluate).toThrow('within the polling window');
  });

  it('uses the latest summary instead of a superseded clean review', () => {
    const { review, evaluate } = fixture();
    review.comments.unshift({ ...review.comments[0]!, updated_at: '2026-10-02T12:00:06Z', body: '<!-- codex-pull-request-review-summary -->\nIn progress' });
    expect(evaluate).toThrow('within the polling window');
  });

  it('requires a review of the head supplied by the caller', () => {
    const { state, evaluate } = fixture();
    state.head = 'abcdef0123456789';
    expect(evaluate).toThrow('within the polling window');
  });

  it('accepts a clean reaction in the completion second at GitHub timestamp precision', () => {
    const { review, evaluate } = fixture();
    review.comments[0]!.body = review.comments[0]!.body.replace(completed, '2026-10-02T12:00:00.687978Z');
    review.reactions[0]!.created_at = completed;
    expect(evaluate()).toContain('Clean Codex review completed for 0123456789abcdef.');
  });

  it('rejects a reaction from before the review completion second', () => {
    const { review, evaluate } = fixture();
    review.comments[0]!.body = review.comments[0]!.body.replace(completed, '2026-10-02T12:00:00.687978Z');
    review.reactions[0]!.created_at = '2026-10-02T11:59:59Z';
    expect(evaluate).toThrow('within the polling window');
  });

  it.each(['summary author', 'reaction author', 'reaction content'])('rejects the wrong %s as clean-review evidence', (change) => {
    const { review, evaluate } = fixture();
    if (change === 'summary author') review.comments[0]!.user.login = 'someone-else';
    else if (change === 'reaction author') review.reactions[0]!.user.login = 'someone-else';
    else review.reactions[0]!.content = 'eyes';
    expect(evaluate).toThrow('within the polling window');
  });

  it.each(['missing', 'invalid'])('waits for valid evidence when the completion timestamp is %s', (timestamp) => {
    const { review, evaluate } = fixture();
    review.comments[0]!.body = review.comments[0]!.body.replace(`datetime="${completed}"`, timestamp === 'missing' ? '' : 'datetime="invalid"');
    expect(evaluate).toThrow('within the polling window');
  });

  it('reads trusted review evidence across comment and reaction pages', () => {
    const { review, evaluate } = fixture();
    review.comments.unshift({ user: { login: 'someone-else' }, updated_at: '2026-10-02T12:00:06Z', body: 'Unrelated comment' });
    review.reactions.unshift({ user: { login: 'someone-else' }, content: '+1', created_at: '2026-10-02T12:00:03Z' });
    expect(evaluate()).toContain('Clean Codex review completed for 0123456789abcdef.');
  });

  it.each(['/comments', '/reactions'])('reports a failed API read at %s', (route) => {
    const { state, evaluate } = fixture();
    state.apiError = route;
    expect(evaluate).toThrow('HTTP 403');
  });
});
