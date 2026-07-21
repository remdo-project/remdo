import process from 'node:process';
import { runReadOnlyAgentWithProcessSignals } from '../../_shared/tools/read-only-agent-runner';
import type { CodexAgentRequest, ReadOnlyAgentResult } from '../../_shared/tools/read-only-agent-runner';

function fail(message: string): never {
  process.stderr.write(`run-codex-review: ${message}\n`);
  process.exit(1);
}

function requestFromArgs(args: string[]): CodexAgentRequest {
  if (args[0] === 'working-tree') {
    if (args.length !== 1) {
      fail('working-tree scope takes no revisions');
    }
    return {
      adapter: 'codex',
      invocation: { kind: 'review', target: { kind: 'working-tree' } },
      response: { kind: 'text' },
    };
  }
  if (args[0] === 'committed-range') {
    const base = args[1];
    if (args.length !== 2 || base === undefined || base.trim() === '') {
      fail('committed-range scope requires a base SHA');
    }
    return {
      adapter: 'codex',
      invocation: { kind: 'review', target: { kind: 'base', base } },
      response: { kind: 'text' },
    };
  }
  return fail("expected 'working-tree' or 'committed-range' scope");
}

function reportResult(result: ReadOnlyAgentResult): void {
  if (result.status === 'unavailable') {
    process.stderr.write(`run-codex-review: ${result.evidence}\n`);
    process.exit(2);
  }
  if (result.status === 'failed') {
    fail(result.evidence);
  }
  const response = result.response;
  if (response.kind !== 'text') {
    fail('shared runner returned an unexpected structured response');
  }
  process.stdout.write(response.value);
  if (!response.value.endsWith('\n')) {
    process.stdout.write('\n');
  }
}

reportResult(await runReadOnlyAgentWithProcessSignals(requestFromArgs(process.argv.slice(2))));
