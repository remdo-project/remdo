import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { runClaude } from './read-only-runner/claude.ts';
import { runCodex } from './read-only-runner/codex.ts';
import {
  normalizedEnvironment,
  runProcess,
} from './read-only-runner/process.ts';
import type {
  ReviewCall,
  RunnerResult,
} from './read-only-runner/types.ts';

function parseCall(args: string[]): ReviewCall {
  const settings: ReviewCall['settings'] = {};
  let index = 0;

  while (args[index]?.startsWith('--') === true) {
    const option = args[index];
    if (option !== '--model' && option !== '--effort') {
      throw new Error(`unknown option: ${option}`);
    }
    const setting = option === '--model' ? 'model' : 'effort';
    if (settings[setting] !== undefined) {
      throw new Error(`duplicate option: ${option}`);
    }
    if (index + 1 >= args.length) {
      throw new Error(`${option} requires a value`);
    }
    settings[setting] = args[index + 1]!;
    index += 2;
  }

  const agent = args[index];
  if (agent !== 'codex' && agent !== 'claude') {
    throw new Error("expected agent 'codex' or 'claude'");
  }
  if (args[index + 1] !== 'review') {
    throw new Error("expected invocation 'review'");
  }
  const scope = args[index + 2];
  if (scope === 'uncommitted') {
    if (args.length !== index + 3) {
      throw new Error('uncommitted review takes no revisions');
    }
    return { agent, scope: { kind: 'uncommitted' }, settings };
  }
  if (scope === 'commit-range') {
    if (args.length !== index + 4) {
      throw new Error('commit-range review requires exactly one base');
    }
    return {
      agent,
      scope: { kind: 'commit-range', base: args[index + 3]! },
      settings,
    };
  }
  throw new Error("expected review scope 'uncommitted' or 'commit-range'");
}

async function repositoryRoot(
  cwd: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<{ evidence?: string; repository?: string }> {
  const outcome = await runProcess(
    'git',
    ['rev-parse', '--path-format=absolute', '--show-toplevel'],
    { cwd, environment, signal },
  );
  if (outcome.aborted) {
    return { evidence: 'repository resolution was cancelled' };
  }
  if (outcome.spawnError !== undefined || outcome.exitCode !== 0) {
    return { evidence: 'could not resolve repository root' };
  }
  const repository = outcome.stdout.trim();
  if (repository === '') {
    return { evidence: 'git returned an empty repository root' };
  }
  return { repository };
}

async function run(
  call: ReviewCall,
  signal: AbortSignal,
): Promise<RunnerResult> {
  if (signal.aborted) {
    return { status: 'failed', evidence: 'agent invocation was cancelled' };
  }
  const environment = normalizedEnvironment();
  const resolved = await repositoryRoot(
    path.resolve(process.cwd()),
    environment,
    signal,
  );
  if (resolved.repository === undefined) {
    return {
      status: 'failed',
      evidence: resolved.evidence ?? 'could not resolve repository root',
    };
  }
  if (call.agent === 'claude') {
    return await runClaude(call, resolved.repository, environment, signal);
  }
  let tempDir: Awaited<ReturnType<typeof fs.mkdtempDisposable>>;
  try {
    tempDir = await fs.mkdtempDisposable(
      path.join(os.tmpdir(), 'remdo-read-only-runner.'),
    );
  } catch (error) {
    return {
      status: 'failed',
      evidence: `could not create temporary output: ${String(error)}`,
    };
  }
  await using output = tempDir;
  return await runCodex(
    call,
    resolved.repository,
    environment,
    signal,
    output.path,
  );
}

async function main(): Promise<void> {
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const result = await run(parseCall(process.argv.slice(2)), controller.signal);
    if (result.status === 'responded') {
      process.stdout.write(result.response);
      return;
    }
    process.stderr.write(`read-only-runner: ${result.evidence}`);
    if (result.preserveEvidenceEnd !== true && !result.evidence.endsWith('\n')) {
      process.stderr.write('\n');
    }
    process.exitCode = result.status === 'unavailable' ? 2 : 1;
  } catch (error) {
    process.stderr.write(
      `read-only-runner: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

await main();
