/* eslint-disable node/no-process-env */
// Opt-in real-provider validation; excluded from normal test suites.
// Usage: node .agents/skills/_shared/tests/read-only-runner.acceptance.ts
import { spawn, spawnSync } from 'node:child_process';
import type { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

type Provider = 'claude' | 'codex';

interface Fixture {
  base?: string;
  excludedSignals: string[];
  expectedSignals: string[][];
  invocation: 'committed-range' | 'working-tree';
  name: string;
  root: string;
}

interface Observation {
  evidence?: string;
  excludedSignals: string[];
  expectedSignals: Array<{ matched: boolean; signals: string[] }>;
  fixture: string;
  kind: 'prompt' | 'review';
  mutationFree: boolean;
  provider: Provider;
  report?: string;
  status: 'failed' | 'responded' | 'unavailable';
}

const projectRoot = path.resolve(import.meta.dirname, '../../../..');
const runner = path.join(
  projectRoot,
  '.agents/skills/_shared/tools/read-only-runner.ts',
);
const evidencePath = path.join(
  projectRoot,
  '.agent/read-only-runner-acceptance.jsonl',
);
const tempRoots: string[] = [];
const gitEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_EMAIL: 'runner-acceptance@example.com',
  GIT_AUTHOR_NAME: 'Runner Acceptance',
  GIT_COMMITTER_EMAIL: 'runner-acceptance@example.com',
  GIT_COMMITTER_NAME: 'Runner Acceptance',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

function fail(message: string): never {
  throw new Error(message);
}

function run(
  command: string,
  args: string[],
  options: { cwd: string; environment?: NodeJS.ProcessEnv },
): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.environment ?? process.env,
  });
  if (result.status !== 0) {
    fail(
      result.stderr.trim()
      || result.error?.message
      || `${command} ${args.join(' ')} failed with status ${String(result.status)}`,
    );
  }
  return result.stdout.trimEnd();
}

function git(root: string, ...args: string[]): string {
  return run('git', args, { cwd: root, environment: gitEnvironment });
}

function write(root: string, relativePath: string, contents: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function commit(root: string, message: string): string {
  git(root, 'add', '--all');
  git(root, 'commit', '--quiet', '--message', message);
  return git(root, 'rev-parse', 'HEAD');
}

function tempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function initializeRepository(name: string): string {
  const root = tempRoot(`remdo-runner-${name}.`);
  git(root, 'init', '--quiet', '--initial-branch=main');
  write(root, 'AGENTS.md', [
    '# Read-only runner acceptance fixture',
    '',
    'Review only defects introduced by the requested scope.',
    'Report each correctness defect with its file or function name.',
    '',
  ].join('\n'));
  write(root, 'src/shared/arithmetic.ts', [
    'export function baselineRatio(numerator: number, denominator: number): number {',
    '  return numerator * denominator;',
    '}',
    '',
  ].join('\n'));
  commit(root, 'fixture base with excluded decoy');
  return root;
}

function createCommittedRangeFixture(): Fixture {
  const root = initializeRepository('committed-range');
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'switch', '--quiet', '--create', 'feature');
  write(root, 'src/range-authorization.ts', [
    'export function canDeleteWorkspace(requesterId: string, ownerId: string): boolean {',
    '  return requesterId !== ownerId;',
    '}',
    '',
  ].join('\n'));
  commit(root, 'add known range defect');
  return {
    base,
    excludedSignals: ['baselineRatio'],
    expectedSignals: [
      ['src/range-authorization.ts', 'canDeleteWorkspace'],
    ],
    invocation: 'committed-range',
    name: 'known-defect-committed-range',
    root,
  };
}

function createWorkingTreeFixture(): Fixture {
  const root = initializeRepository('working-tree');
  git(root, 'switch', '--quiet', '--create', 'feature');
  write(root, 'src/server/cache-policy.ts', [
    'export function cacheIsFresh(savedAt: number, now: number, ttl: number): boolean {',
    '  return now - savedAt > ttl;',
    '}',
    '',
  ].join('\n'));
  write(root, 'src/server/required-owner.ts', [
    'export function requireOwner(requesterId: string, ownerId: string): void {',
    '  if (requesterId !== ownerId) throw new Error("forbidden");',
    '}',
    '',
  ].join('\n'));
  write(root, 'src/server/delete-document.ts', [
    'import { requireOwner } from "./required-owner";',
    '',
    'export function deleteDocument(requesterId: string, ownerId: string): void {',
    '  requireOwner(requesterId, ownerId);',
    '}',
    '',
  ].join('\n'));
  write(root, 'src/client/page window.ts', [
    'export function legacyCanDelete(requesterId: string, ownerId: string): boolean {',
    '  return requesterId !== ownerId;',
    '}',
    '',
    'export function pageWindow<T>(items: T[], offset: number, pageSize: number): T[] {',
    '  return items.slice(offset, offset + pageSize);',
    '}',
    '',
  ].join('\n'));
  commit(root, 'add committed history and review baselines');

  write(root, 'src/client/staged-authorization.ts', [
    'export function canEditDocument(requesterId: string, ownerId: string): boolean {',
    '  return requesterId !== ownerId;',
    '}',
    '',
  ].join('\n'));
  git(root, 'add', 'src/client/staged-authorization.ts');
  git(root, 'rm', '--quiet', 'src/server/required-owner.ts');
  write(root, 'src/client/page window.ts', [
    'export function legacyCanDelete(requesterId: string, ownerId: string): boolean {',
    '  return requesterId !== ownerId;',
    '}',
    '',
    'export function pageWindow<T>(items: T[], offset: number, pageSize: number): T[] {',
    '  return items.slice(offset, pageSize);',
    '}',
    '',
  ].join('\n'));
  write(root, 'src/client/untracked page.ts', [
    'export function takePage<T>(items: T[], offset: number, count: number): T[] {',
    '  return items.slice(offset, count);',
    '}',
    '',
  ].join('\n'));
  return {
    excludedSignals: [
      'baselineRatio',
    ],
    expectedSignals: [
      ['src/client/staged-authorization.ts', 'canEditDocument'],
      ['src/client/page window.ts', 'pageWindow'],
      ['src/client/untracked page.ts', 'takePage'],
      ['src/server/delete-document.ts', 'required-owner'],
    ],
    invocation: 'working-tree',
    name: 'literal-path-working-tree',
    root,
  };
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function fingerprint(root: string): string {
  const paths = git(
    root,
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  )
    .split('\0')
    .filter(Boolean)
    .sort();
  const contents = paths.map((relativePath) => {
    const target = path.join(root, relativePath);
    return `${relativePath}\0${sha256(fs.readFileSync(target))}`;
  });
  const indexPath = path.resolve(
    root,
    git(root, 'rev-parse', '--git-path', 'index'),
  );
  const configPath = path.resolve(
    root,
    git(root, 'rev-parse', '--git-path', 'config'),
  );
  return sha256(JSON.stringify({
    branch: git(root, 'symbolic-ref', '--quiet', '--short', 'HEAD'),
    cachedDiff: git(root, 'diff', '--no-ext-diff', '--binary', '--cached', 'HEAD'),
    config: sha256(fs.readFileSync(configPath)),
    contents,
    head: git(root, 'rev-parse', 'HEAD'),
    index: sha256(fs.readFileSync(indexPath)),
    refs: git(root, 'for-each-ref', '--format=%(refname) %(objectname)'),
    status: git(root, 'status', '--short', '--untracked-files=all'),
    trackedDiff: git(root, 'diff', '--no-ext-diff', '--binary', 'HEAD'),
  }));
}

function invoke(
  root: string,
  args: string[],
): Promise<{
    evidence?: string;
    report?: string;
    status: Observation['status'];
  }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [runner, ...args], {
      cwd: root,
      env: gitEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', error => {
      resolve({ status: 'failed', evidence: error.message });
    });
    child.once('close', (code, signal) => {
      if (code === 0 && stdout.trim() !== '') {
        resolve({ status: 'responded', report: stdout });
      } else if (code === 2) {
        resolve({
          status: 'unavailable',
          evidence: stderr.trim() || 'runner unavailable',
        });
      } else {
        resolve({
          status: 'failed',
          evidence: stderr.trim()
          || (code === 0
            ? 'runner returned an empty report'
            : `runner failed with ${
              code === null ? `signal ${signal ?? 'unknown'}` : `status ${code}`
            }`),
        });
      }
    });
  });
}

function record(observation: Observation): void {
  const line = JSON.stringify(observation);
  fs.appendFileSync(evidencePath, `${line}\n`);
  process.stdout.write(`${line}\n`);
}

function findingsText(report: string): string {
  const jsonBlocks = report.split('```json\n')
    .slice(1)
    .map(block => block.split('```', 1)[0]!)
    .join('\n');
  return jsonBlocks === '' ? report : jsonBlocks;
}

async function observePrompt(
  fixture: Fixture,
  provider: Provider,
): Promise<Observation> {
  process.stderr.write(
    `[runner-acceptance] prompt ${provider}: starting\n`,
  );
  const before = fingerprint(fixture.root);
  const result = await invoke(fixture.root, [
    provider,
    'prompt',
    'Inspect AGENTS.md, then respond with the exact marker READ_ONLY_PROMPT_OK.',
  ]);
  const after = fingerprint(fixture.root);
  const observation: Observation = {
    evidence: result.evidence,
    excludedSignals: [],
    expectedSignals: [{
      matched: result.report?.includes('READ_ONLY_PROMPT_OK') === true,
      signals: ['READ_ONLY_PROMPT_OK'],
    }],
    fixture: fixture.name,
    kind: 'prompt',
    mutationFree: before === after,
    provider,
    report: result.report,
    status: result.status,
  };
  record(observation);
  return observation;
}

async function observeReview(
  fixture: Fixture,
  provider: Provider,
): Promise<Observation> {
  process.stderr.write(
    `[runner-acceptance] review ${fixture.name} ${provider}: starting\n`,
  );
  const before = fingerprint(fixture.root);
  const scope = fixture.invocation === 'working-tree'
    ? ['working-tree']
    : ['committed-range', fixture.base!];
  const result = await invoke(fixture.root, [
    '--effort',
    'high',
    provider,
    'review',
    ...scope,
  ]);
  const after = fingerprint(fixture.root);
  const normalized = result.report?.toLowerCase() ?? '';
  const normalizedFindings = findingsText(result.report ?? '').toLowerCase();
  const observation: Observation = {
    evidence: result.evidence,
    excludedSignals: fixture.excludedSignals.filter(signal =>
      normalizedFindings.includes(signal.toLowerCase())),
    expectedSignals: fixture.expectedSignals.map(signals => ({
      matched: signals.some(signal =>
        normalized.includes(signal.toLowerCase())),
      signals,
    })),
    fixture: fixture.name,
    kind: 'review',
    mutationFree: before === after,
    provider,
    report: result.report,
    status: result.status,
  };
  record(observation);
  return observation;
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    fail('usage: read-only-runner.acceptance.ts');
  }
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, '');
  const observations: Observation[] = [];
  try {
    const range = createCommittedRangeFixture();
    observations.push(await observePrompt(range, 'codex'));
    observations.push(await observePrompt(range, 'claude'));
    observations.push(await observeReview(range, 'codex'));
    observations.push(await observeReview(range, 'claude'));
    observations.push(await observeReview(createWorkingTreeFixture(), 'claude'));
  } finally {
    for (const root of tempRoots.reverse()) {
      fs.rmSync(root, { force: true, recursive: true });
    }
  }
  const transportComplete = observations.every(
    observation => observation.status === 'responded',
  );
  const mutationFree = observations.every(
    observation => observation.mutationFree,
  );
  const scopeAndQualityConfirmed = observations.every(
    observation =>
      observation.expectedSignals.every(signal => signal.matched)
      && observation.excludedSignals.length === 0,
  );
  const summary = {
    evidencePath,
    mutationFree,
    scopeAndQualityConfirmed,
    transportComplete,
  };
  fs.appendFileSync(evidencePath, `${JSON.stringify({ summary })}\n`);
  process.stdout.write(`${JSON.stringify({ summary })}\n`);
  if (!transportComplete || !mutationFree || !scopeAndQualityConfirmed) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `read-only runner acceptance: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
}
