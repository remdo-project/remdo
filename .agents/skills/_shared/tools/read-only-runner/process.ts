/* eslint-disable node/no-process-env */
import { spawn } from 'node:child_process';
import process from 'node:process';
import { terminateProcessGroup } from '../../../../../tools/lib/managed-process.ts';
import type {
  Agent,
  ProcessOutcome,
  RunnerResult,
  RunProcessOptions,
} from './types.ts';

const GIT_REDIRECTION_KEYS = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_WORK_TREE',
] as const;

export function runProcess(
  command: string,
  args: string[],
  options: RunProcessOptions,
): Promise<ProcessOutcome> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: process.platform !== 'win32',
      env: options.environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let aborted = false;
    let inputError: NodeJS.ErrnoException | undefined;
    let settled = false;
    let stderr = '';
    let stdout = '';
    let terminating = false;
    const childStdin = child.stdin;
    const childStdout = child.stdout;
    const childStderr = child.stderr;

    const terminate = (): void => {
      if (terminating) {
        return;
      }
      terminating = true;
      if (child.pid !== undefined) {
        try {
          terminateProcessGroup(child, 'SIGKILL');
        } catch {
          // The close or error event remains authoritative for the outcome.
        }
      }
    };
    const abort = (): void => {
      aborted = true;
      terminate();
    };
    const finish = (
      outcome: Omit<ProcessOutcome, 'aborted' | 'stderr' | 'stdout'>,
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      options.signal.removeEventListener('abort', abort);
      resolve({ ...outcome, aborted, stderr, stdout });
    };

    childStdout.setEncoding('utf8');
    childStderr.setEncoding('utf8');
    childStdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') {
        inputError = error;
        terminate();
      }
    });
    childStdout.on('data', chunk => {
      stdout += chunk;
    });
    childStderr.on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      finish({ exitCode: null, signal: null, spawnError: error });
    });
    child.once('close', (exitCode, signal) => {
      finish({ exitCode, signal, spawnError: inputError });
    });

    if (options.signal.aborted) {
      abort();
    } else {
      options.signal.addEventListener('abort', abort, { once: true });
    }
    childStdin.end(options.input ?? '');
  });
}

export function outputEvidence(
  summary: string,
  output: string,
): { evidence: string; preserveEvidenceEnd: boolean } {
  return {
    evidence: output === '' ? summary : `${summary}\n${output}`,
    preserveEvidenceEnd: output !== '',
  };
}

export function outputFailure(
  summary: string,
  stdout: string,
): Extract<RunnerResult, { status: 'failed' }> {
  return { status: 'failed', ...outputEvidence(summary, stdout) };
}

export function providerFailure(
  provider: Agent,
  outcome: ProcessOutcome,
): Extract<RunnerResult, { status: 'failed' | 'unavailable' }> | undefined {
  const name = provider === 'codex' ? 'Codex' : 'Claude';
  if (outcome.spawnError?.code === 'ENOENT') {
    return {
      status: 'unavailable',
      ...outputEvidence(`${name} executable is unavailable`, outcome.stderr),
    };
  }
  if (outcome.spawnError !== undefined) {
    return {
      status: 'failed',
      ...outputEvidence(
        `${name} could not start: ${outcome.spawnError.message}`,
        outcome.stderr,
      ),
    };
  }
  if (outcome.aborted) {
    return {
      status: 'failed',
      ...outputEvidence(`${name} was cancelled`, outcome.stderr),
    };
  }
  if (outcome.exitCode !== 0) {
    return {
      status: 'failed',
      ...outputEvidence(
        `${name} failed with status ${
          outcome.exitCode ?? `signal ${outcome.signal ?? 'unknown'}`
        }`,
        outcome.stderr,
      ),
    };
  }
  return undefined;
}

export function normalizedEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...source };
  for (const key of GIT_REDIRECTION_KEYS) {
    delete environment[key];
  }
  if (environment.CODEX_ACCESS_TOKEN?.trim() === '') {
    delete environment.CODEX_ACCESS_TOKEN;
  }
  return environment;
}
