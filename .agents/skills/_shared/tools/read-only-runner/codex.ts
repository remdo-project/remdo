import fs from 'node:fs/promises';
import path from 'node:path';
import {
  REVIEW_INSTRUCTION,
  serializeReviewEvidence,
} from './review.ts';
import {
  outputFailure,
  providerFailure,
  runProcess,
} from './process.ts';
import type { ReviewCall, RunnerResult } from './types.ts';

function tomlString(value: string): string {
  return JSON.stringify(value).replaceAll('\u007F', '\\u007F');
}

function codexArgs(call: ReviewCall, reportPath: string): string[] {
  const args = [
    'exec',
    '--ignore-rules',
    '--disable',
    'hooks',
    '--disable',
    'apps',
    '--disable',
    'plugins',
    '--sandbox',
    'read-only',
    '-c',
    'approval_policy="never"',
    '-c',
    'notify=[]',
    '--ephemeral',
  ];
  if (call.settings.model !== undefined) {
    args.push('--model', call.settings.model);
  }
  if (call.settings.effort !== undefined) {
    args.push(
      '-c',
      `model_reasoning_effort=${tomlString(call.settings.effort)}`,
    );
  }
  args.push(
    '-c',
    `developer_instructions=${tomlString(REVIEW_INSTRUCTION)}`,
    '--output-last-message',
    reportPath,
    'review',
  );
  if (call.scope.kind === 'uncommitted') {
    args.push('--uncommitted');
  } else {
    args.push('--base', call.scope.base);
  }
  return args;
}

export async function runCodex(
  call: ReviewCall,
  repository: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
  tempDir: string,
): Promise<RunnerResult> {
  const reportPath = path.join(tempDir, 'final-response');
  const outcome = await runProcess('codex', codexArgs(call, reportPath), {
    cwd: repository,
    environment,
    signal,
  });
  const failure = providerFailure('codex', outcome);
  if (failure !== undefined) {
    return failure;
  }
  let response = '';
  try {
    response = await fs.readFile(reportPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return outputFailure(
        `could not read Codex final response: ${String(error)}`,
        outcome.stdout,
      );
    }
  }
  if (response.trim() === '') {
    return outputFailure(
      'Codex completed without a final response',
      outcome.stdout,
    );
  }
  return {
    status: 'responded',
    response: serializeReviewEvidence([response]),
  };
}
