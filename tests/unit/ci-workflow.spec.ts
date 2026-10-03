import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  jobs: { 'merge-ready': { steps: [{ run: string }] } };
};
const script = workflow.jobs['merge-ready'].steps[0].run;

function evaluate(job: string, result: string) {
  const needs = {
    lint: { result: 'success' },
    unit: { result: 'success' },
    collab: { result: 'success' },
    e2e: { result: 'success' },
    docker: { result: 'success' },
    codex: { result: 'success' },
    [job]: { result },
  };
  return spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    // eslint-disable-next-line node/no-process-env
    env: { ...process.env, RESULTS: JSON.stringify(needs) },
  }).status;
}

describe('merge readiness', () => {
  it('passes after every required pipeline and Codex review succeeds', () => {
    expect(evaluate('codex', 'success')).toBe(0);
  });

  it('rejects a failed CI pipeline', () => {
    expect(evaluate('e2e', 'failure')).toBe(1);
  });

  it.each(['failure', 'cancelled', 'skipped'])('rejects a %s Codex review', (result) => {
    expect(evaluate('codex', result)).toBe(1);
  });
});
