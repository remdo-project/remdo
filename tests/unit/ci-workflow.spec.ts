import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  jobs: { 'merge-ready': { needs: string[]; steps: [{ run: string }] } };
};
const gate = workflow.jobs['merge-ready'];

function evaluate(job: string, result: string) {
  const needs = Object.fromEntries(gate.needs.map(name => [
    name, { result: name === job ? result : 'success' },
  ]));
  return spawnSync('bash', ['-c', gate.steps[0].run], {
    encoding: 'utf8',
    // eslint-disable-next-line node/no-process-env
    env: { ...process.env, RESULTS: JSON.stringify(needs) },
  }).status;
}

describe('merge readiness', () => {
  it('passes after every required pipeline and Codex review succeeds', () => {
    expect(evaluate('codex', 'success')).toBe(0);
  });

  it.each(['lint', 'unit', 'collab', 'e2e', 'docker', 'codex'])('rejects a failed %s gate', (job) => {
    expect(evaluate(job, 'failure')).toBe(1);
  });

  it.each(['cancelled', 'skipped'])('rejects a %s Codex review', (result) => {
    expect(evaluate('codex', result)).toBe(1);
  });
});
