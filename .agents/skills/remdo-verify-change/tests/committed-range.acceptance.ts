/* eslint-disable node/no-process-env */
// Opt-in real-provider validation; excluded from normal test suites.
// Usage: node --import tsx committed-range.acceptance.ts
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
interface Fixture {
  base: string;
  excludedSignals: string[];
  expectedSignals: string[][];
  head: string;
  name: string;
  range: string;
  root: string;
}

interface ReviewObservation {
  excludedSignals: string[];
  expectedSignals: Array<{ matched: boolean; signals: string[] }>;
  fixture: string;
  mutationFree: boolean;
  provider: 'claude' | 'codex';
  report?: string;
  status: 'failed' | 'responded' | 'unavailable';
  evidence?: string;
}

const projectRoot = path.resolve(import.meta.dirname, '../../../..');
const resolver = path.join(projectRoot, '.agents/skills/_shared/tools/resolve-scope.sh');
const adapterScripts = {
  claude: path.join(
    projectRoot,
    '.agents/skills/remdo-verify-change/tools/run-claude-review.sh',
  ),
  codex: path.join(
    projectRoot,
    '.agents/skills/remdo-verify-change/tools/run-codex-review.sh',
  ),
} as const;
const tempRoots: string[] = [];
const gitEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_EMAIL: 'range-acceptance@example.com',
  GIT_AUTHOR_NAME: 'Range Acceptance',
  GIT_COMMITTER_EMAIL: 'range-acceptance@example.com',
  GIT_COMMITTER_NAME: 'Range Acceptance',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
function fail(message: string): never {
  throw new Error(message);
}

function run(
  command: string,
  args: string[],
  options: { cwd: string; environment?: NodeJS.ProcessEnv } = { cwd: projectRoot },
): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.environment ?? process.env,
  });
  if (result.status !== 0) {
    fail(
      result.stderr?.trim()
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

function initializeFixture(name: string): { base: string; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `remdo-range-${name}.`));
  tempRoots.push(root);
  git(root, 'init', '--quiet', '--initial-branch=main');
  write(root, 'AGENTS.md', [
    '# Range review fixture',
    '',
    'Review only defects introduced by the requested Git diff.',
    'Treat unchanged code and changes on other branches as out of scope.',
    'Report each correctness defect with its file and function name.',
    '',
  ].join('\n'));
  write(root, 'src/baseline-decoy.ts', [
    'export function baselineDivide(numerator: number, denominator: number): number {',
    '  return numerator * denominator;',
    '}',
    '',
  ].join('\n'));
  return { root, base: commit(root, 'fixture base with unchanged decoy') };
}

function createLinearFixture(): Fixture {
  const { base, root } = initializeFixture('linear');
  git(root, 'switch', '--quiet', '--create', 'feature-linear');
  write(root, 'src/range-authorization.ts', [
    'export function canDeleteWorkspace(requesterId: string, ownerId: string): boolean {',
    '  return requesterId !== ownerId;',
    '}',
    '',
  ].join('\n'));
  commit(root, 'add workspace authorization');
  write(root, 'src/range-pagination.ts', [
    'export function pageWindow<T>(items: T[], offset: number, pageSize: number): T[] {',
    '  return items.slice(offset, pageSize);',
    '}',
    '',
  ].join('\n'));
  const head = commit(root, 'add paginated window');
  return resolveFixture({
    root,
    name: 'linear-two-dot',
    range: `${base}..HEAD`,
    expectedSignals: [
      ['src/range-authorization.ts', 'canDeleteWorkspace'],
      ['src/range-pagination.ts', 'pageWindow'],
    ],
    excludedSignals: ['src/baseline-decoy.ts', 'baselineDivide'],
  }, head);
}

function createDivergentFixture(): Fixture {
  const { base, root } = initializeFixture('divergent');
  git(root, 'switch', '--quiet', '--create', 'feature-divergent');
  write(root, 'src/feature-permissions.ts', [
    "export function canArchiveProject(role: string): boolean {",
    "  return role !== 'admin';",
    '}',
    '',
  ].join('\n'));
  commit(root, 'add feature archive permission');
  write(root, 'src/feature-cache.ts', [
    'export function cacheIsFresh(savedAt: number, now: number, ttl: number): boolean {',
    '  return now - savedAt > ttl;',
    '}',
    '',
  ].join('\n'));
  const head = commit(root, 'add feature cache freshness');
  git(root, 'switch', '--quiet', 'main');
  write(root, 'src/upstream-only-decoy.ts', [
    "export function upstreamCanPublish(role: string): boolean {",
    "  return role !== 'publisher';",
    '}',
    '',
  ].join('\n'));
  commit(root, 'upstream-only decoy');
  git(root, 'switch', '--quiet', 'feature-divergent');
  return resolveFixture({
    root,
    name: 'divergent-three-dot',
    range: 'main...HEAD',
    expectedSignals: [
      ['src/feature-permissions.ts', 'canArchiveProject'],
      ['src/feature-cache.ts', 'cacheIsFresh'],
    ],
    excludedSignals: [
      'src/baseline-decoy.ts',
      'baselineDivide',
      'src/upstream-only-decoy.ts',
      'upstreamCanPublish',
    ],
  }, head, base);
}

function resolveFixture(
  fixture: Omit<Fixture, 'base' | 'head'>,
  expectedHead: string,
  expectedBase?: string,
): Fixture {
  const output = run('sh', [resolver, fixture.range], {
    cwd: fixture.root,
    environment: gitEnvironment,
  });
  const lines = output.split('\n');
  const filesIndex = lines.indexOf('FILES');
  const values = Object.fromEntries(
    lines.slice(0, filesIndex).map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
  );
  const base = values.BASE;
  const head = values.HEAD_SHA;
  if (values.SCOPE !== 'committed-range' || base === undefined || head === undefined) {
    fail(`${fixture.name}: resolver did not return a committed range`);
  }
  if (head !== expectedHead || (expectedBase !== undefined && base !== expectedBase)) {
    fail(`${fixture.name}: resolver returned unexpected immutable endpoints`);
  }
  const files = lines.slice(filesIndex + 1);
  for (const signals of fixture.expectedSignals) {
    if (!files.includes(signals[0]!)) {
      fail(`${fixture.name}: resolver omitted ${signals[0]}`);
    }
  }
  for (const signal of fixture.excludedSignals.filter(item => item.includes('/'))) {
    if (files.includes(signal)) {
      fail(`${fixture.name}: resolver included excluded path ${signal}`);
    }
  }
  return { ...fixture, base, head };
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function fingerprint(root: string): string {
  const paths = git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z')
    .split('\0')
    .filter(Boolean)
    .sort();
  const contents = paths.map((relativePath) => {
    const target = path.join(root, relativePath);
    return `${relativePath}\0${sha256(fs.readFileSync(target))}`;
  });
  const indexPath = path.resolve(root, git(root, 'rev-parse', '--git-path', 'index'));
  return sha256(JSON.stringify({
    branch: git(root, 'symbolic-ref', '--quiet', '--short', 'HEAD'),
    cachedDiff: git(root, 'diff', '--no-ext-diff', '--binary', '--cached', 'HEAD'),
    contents,
    head: git(root, 'rev-parse', 'HEAD'),
    index: sha256(fs.readFileSync(indexPath)),
    refs: git(root, 'for-each-ref', '--format=%(refname) %(objectname)'),
    status: git(root, 'status', '--short', '--untracked-files=all'),
    trackedDiff: git(root, 'diff', '--no-ext-diff', '--binary', 'HEAD'),
  }));
}

function runAdapter(
  fixture: Fixture,
  provider: 'claude' | 'codex',
): Promise<{ evidence?: string; report?: string; status: ReviewObservation['status'] }> {
  const args = provider === 'codex'
    ? [adapterScripts.codex, 'committed-range', fixture.base]
    : [adapterScripts.claude, 'committed-range', fixture.base, fixture.head];
  return new Promise((resolve) => {
    const child = spawn('sh', args, {
      cwd: fixture.root,
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
      const report = stdout.trim();
      if (code === 0 && report !== '') {
        resolve({ status: 'responded', report });
      } else if (code === 2) {
        resolve({ status: 'unavailable', evidence: stderr.trim() || 'adapter unavailable' });
      } else {
        resolve({
          status: 'failed',
          evidence: stderr.trim()
          || (code === 0
            ? 'adapter returned an empty report'
            : `adapter failed with ${code === null ? `signal ${signal ?? 'unknown'}` : `status ${code}`}`),
        });
      }
    });
  });
}

async function observe(
  fixture: Fixture,
  provider: 'claude' | 'codex',
): Promise<ReviewObservation> {
  process.stderr.write(
    `[range-acceptance] ${fixture.name} ${provider}: starting adapter\n`,
  );
  const before = fingerprint(fixture.root);
  const result = await runAdapter(fixture, provider);
  const after = fingerprint(fixture.root);
  const report = result.report;
  const normalized = report?.toLowerCase() ?? '';
  const observation: ReviewObservation = {
    fixture: fixture.name,
    provider,
    status: result.status,
    mutationFree: before === after,
    expectedSignals: fixture.expectedSignals.map(signals => ({
      signals,
      matched: signals.some(signal => normalized.includes(signal.toLowerCase())),
    })),
    excludedSignals: fixture.excludedSignals.filter(signal =>
      normalized.includes(signal.toLowerCase())),
    report,
    evidence: result.evidence,
  };
  process.stdout.write(`${JSON.stringify(observation)}\n`);
  process.stderr.write(
    `[range-acceptance] ${fixture.name} ${provider}: ${observation.status}; mutation-free=${String(
      observation.mutationFree,
    )}\n`,
  );
  return observation;
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    fail('usage: committed-range.acceptance.ts');
  }
  const fixtures = [createLinearFixture(), createDivergentFixture()];
  const observations: ReviewObservation[] = [];
  try {
    for (const fixture of fixtures) {
      observations.push(await observe(fixture, 'codex'));
      observations.push(await observe(fixture, 'claude'));
    }
  } finally {
    for (const root of tempRoots.reverse()) {
      fs.rmSync(root, { force: true, recursive: true });
    }
  }
  const transportComplete = observations.every(observation =>
    observation.status === 'responded');
  const mutationFree = observations.every(observation => observation.mutationFree);
  const rangeConfirmed = observations.every(observation =>
    observation.expectedSignals.every(signal => signal.matched)
    && observation.excludedSignals.length === 0);
  process.stdout.write(`${JSON.stringify({
    summary: {
      mutationFree,
      rangeConfirmed,
      transportComplete,
    },
  })}\n`);
  if (!transportComplete || !mutationFree || !rangeConfirmed) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `committed-range acceptance: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
  for (const root of tempRoots.reverse()) {
    fs.rmSync(root, { force: true, recursive: true });
  }
}
