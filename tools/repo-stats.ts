import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

interface FileStatsBucket {
  files: number;
  lines: number;
}

interface RepoStats {
  generatedAt: string;
  files: {
    totalFiles: number;
    textFiles: number;
    binaryFiles?: number;
    byType: Record<string, FileStatsBucket>;
  };
  tests: {
    unit: number;
    collab: number;
    e2e: number;
    totalUnique: number;
  };
  totals: {
    files: {
      files: number;
      lines: number;
    };
    tests: {
      totalUnique: number;
    };
  };
}

interface CliArguments {
  json: boolean;
  update: boolean;
  help: boolean;
}

interface VitestListItem {
  file: string;
  name: string;
}

interface PlaywrightSuite {
  file?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightSpec {
  id?: string;
  title?: string;
  file?: string;
}

interface PlaywrightListReport {
  suites?: PlaywrightSuite[];
}

interface ComparisonMetric {
  id: string;
  label: string;
  current: number;
  baseline: number;
  delta: number;
  deltaPct: number | null;
  thresholdApplies: boolean;
  failed: boolean;
}

interface ComparisonResult {
  metrics: ComparisonMetric[];
  failedMetrics: ComparisonMetric[];
}

const repoRoot = process.cwd();
const envScript = path.join(repoRoot, 'tools/env.sh');
const baselinePath = path.resolve(repoRoot, 'repo-stats.json');
const thresholdRatio = 0.1;
const generatedFilePatterns: RegExp[] = [
  /^pnpm-lock\.yaml$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^bun\.lockb$/,
  /^data\/\.vendor\/.+/,
];

const thresholdMetricIds = new Set([
  'files.total.files',
  'files.total.lines',
  'tests.totalUnique',
]);

try {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
  } else {
    const currentStats = collectStats();

    if (args.update) {
      writeJson(baselinePath, currentStats);
      if (args.json) {
        process.stdout.write(`${JSON.stringify(currentStats, null, 2)}\n`);
      } else {
        printSummary(currentStats);
        process.stdout.write(`\nBaseline updated: ${path.basename(baselinePath)}\n`);
      }
    } else {
      const baselineStats = readBaselineStats();
      const comparison = compareStats(currentStats, baselineStats);

      if (args.json) {
        process.stdout.write(`${JSON.stringify({
          baselinePath: path.basename(baselinePath),
          thresholdPercent: thresholdRatio * 100,
          baselineGeneratedAt: baselineStats.generatedAt,
          current: currentStats,
          comparison,
        }, null, 2)}\n`);
      } else {
        printSummary(currentStats, comparison, baselineStats);
      }

      if (comparison.failedMetrics.length > 0) {
        process.exitCode = 1;
      }
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function parseArgs(argv: string[]): CliArguments {
  const parsed: CliArguments = { json: false, update: false, help: false };

  for (const arg of argv) {
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }

    if (arg === '--update') {
      parsed.update = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printUsage(): void {
  process.stdout.write('Usage: pnpm run stats:repo [--json] [--update]\n');
}

function collectStats(): RepoStats {
  const trackedFiles = listTrackedFiles();
  const fileBuckets = new Map<string, FileStatsBucket>();
  let textFiles = 0;
  let binaryFiles = 0;

  for (const relPath of trackedFiles) {
    const absolutePath = path.resolve(repoRoot, relPath);
    const type = fileTypeForPath(relPath);
    const bucket = getOrCreateFileBucket(fileBuckets, type);
    bucket.files += 1;

    const fileBuffer = fs.readFileSync(absolutePath);
    if (isBinary(fileBuffer)) {
      binaryFiles += 1;
      continue;
    }

    bucket.lines += countNonEmptyLines(fileBuffer.toString('utf8'));
    textFiles += 1;
  }

  const byType = mapToSortedObject(fileBuckets, (a, b) => {
    if (a[1].files !== b[1].files) {
      return b[1].files - a[1].files;
    }
    return a[0].localeCompare(b[0]);
  }, (entry) => entry[1].lines > 0);

  const fileTotals = totalsFromFileBuckets(byType);

  const unitCaseKeys = collectVitestCaseKeys(false);
  const collabCaseKeys = collectVitestCaseKeys(true);
  const e2eCaseKeys = collectPlaywrightCaseKeys();
  const totalUnique = new Set([...unitCaseKeys, ...collabCaseKeys, ...e2eCaseKeys]).size;

  return {
    generatedAt: new Date().toISOString(),
    files: {
      totalFiles: trackedFiles.length,
      textFiles,
      ...(binaryFiles > 0 ? { binaryFiles } : {}),
      byType,
    },
    tests: {
      unit: unitCaseKeys.length,
      collab: collabCaseKeys.length,
      e2e: e2eCaseKeys.length,
      totalUnique,
    },
    totals: {
      files: fileTotals,
      tests: {
        totalUnique,
      },
    },
  };
}

function readBaselineStats(): RepoStats {
  if (!fs.existsSync(baselinePath)) {
    throw new Error('Missing repo-stats.json. Run "pnpm run stats:repo --update" to create it.');
  }

  const content = fs.readFileSync(baselinePath, 'utf8');
  try {
    return JSON.parse(content) as RepoStats;
  } catch {
    throw new Error('Failed to parse repo-stats.json. Run "pnpm run stats:repo --update" to regenerate it.');
  }
}

function compareStats(current: RepoStats, baseline: RepoStats): ComparisonResult {
  const metrics = [
    buildComparisonMetric(
      'files.total.files',
      'Files Total files',
      current.totals.files.files,
      baseline.totals.files.files,
    ),
    buildComparisonMetric(
      'files.total.lines',
      'Files Total lines',
      current.totals.files.lines,
      baseline.totals.files.lines,
    ),
    buildComparisonMetric('tests.unit', 'Test unit', current.tests.unit, baseline.tests.unit),
    buildComparisonMetric('tests.collab', 'Test collab', current.tests.collab, baseline.tests.collab),
    buildComparisonMetric('tests.e2e', 'Test e2e', current.tests.e2e, baseline.tests.e2e),
    buildComparisonMetric(
      'tests.totalUnique',
      'Test Total (unique)',
      current.tests.totalUnique,
      baseline.tests.totalUnique,
    ),
  ];

  return {
    metrics,
    failedMetrics: metrics.filter((metric) => metric.failed),
  };
}

function buildComparisonMetric(id: string, label: string, current: number, baseline: number): ComparisonMetric {
  const delta = current - baseline;
  const deltaPct = baseline === 0
    ? (delta === 0 ? 0 : null)
    : ((delta / baseline) * 100);
  const thresholdApplies = thresholdMetricIds.has(id);
  const failed = thresholdApplies && exceedsThreshold(current, baseline);

  return {
    id,
    label,
    current,
    baseline,
    delta,
    deltaPct,
    thresholdApplies,
    failed,
  };
}

function exceedsThreshold(current: number, baseline: number): boolean {
  if (baseline === 0) {
    return current !== 0;
  }
  return Math.abs((current - baseline) / baseline) > thresholdRatio;
}

function listTrackedFiles(): string[] {
  const stdout = runCommand('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  return stdout
    .split('\0')
    .map((entry) => normalizeRelativePath(entry))
    .filter((entry) => entry.length > 0)
    .filter((entry) => !isExcludedGeneratedFile(entry));
}

function isExcludedGeneratedFile(relativePath: string): boolean {
  return generatedFilePatterns.some((pattern) => pattern.test(relativePath));
}

function collectVitestCaseKeys(collabEnabled: boolean): string[] {
  const stdout = runCommand(
    envScript,
    ['pnpm', 'exec', 'vitest', 'list', 'tests/unit', '--json', '--run'],
    { NODE_ENV: 'test', COLLAB_ENABLED: collabEnabled ? 'true' : 'false' },
  );
  const parsed = JSON.parse(stdout) as VitestListItem[];
  const keys: string[] = [];
  const occurrenceCount = new Map<string, number>();

  for (const item of parsed) {
    const relPath = normalizeTestPath(item.file, 'tests/unit');
    const baseKey = [relPath, item.name].join('\0');
    const count = (occurrenceCount.get(baseKey) ?? 0) + 1;
    occurrenceCount.set(baseKey, count);
    keys.push(`vitest:${baseKey}\0${count}`);
  }

  return keys;
}

function collectPlaywrightCaseKeys(): string[] {
  const stdout = runCommand(
    envScript,
    ['pnpm', 'exec', 'playwright', 'test', '--list', '--reporter=json', 'tests/e2e'],
    { NODE_ENV: 'test' },
  );
  const parsed = JSON.parse(stdout) as PlaywrightListReport;
  const keys: string[] = [];
  const seenSpecIds = new Set<string>();
  const occurrenceCount = new Map<string, number>();

  const visitSuite = (suite: PlaywrightSuite, inheritedFile?: string): void => {
    const suiteFile = suite.file ? normalizeTestPath(suite.file, 'tests/e2e') : inheritedFile;
    for (const spec of suite.specs ?? []) {
      const specFile = spec.file ? normalizeTestPath(spec.file, 'tests/e2e') : suiteFile;
      if (!specFile) {
        continue;
      }

      const specKey = [spec.id ?? '', spec.title ?? '', specFile].join('\0');
      if (seenSpecIds.has(specKey)) {
        continue;
      }
      seenSpecIds.add(specKey);

      const baseKey = [specFile, spec.title ?? ''].join('\0');
      const count = (occurrenceCount.get(baseKey) ?? 0) + 1;
      occurrenceCount.set(baseKey, count);
      keys.push(`playwright:${baseKey}\0${count}`);
    }

    for (const childSuite of suite.suites ?? []) {
      visitSuite(childSuite, suiteFile);
    }
  };

  for (const topLevelSuite of parsed.suites ?? []) {
    visitSuite(topLevelSuite);
  }

  return keys;
}

function fileTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext) {
    return ext;
  }

  const base = path.basename(filePath).toLowerCase();
  if (!base) {
    return '[unknown]';
  }

  if (base.startsWith('.')) {
    return base.slice(1) || '[dotfile]';
  }

  return base;
}

function countNonEmptyLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  const lines = text.split(/\r?\n/);
  let nonEmptyLines = 0;
  for (const line of lines) {
    if (line.trim().length > 0) {
      nonEmptyLines += 1;
    }
  }

  return nonEmptyLines;
}

function isBinary(buffer: Uint8Array): boolean {
  return buffer.includes(0);
}

function getOrCreateFileBucket(map: Map<string, FileStatsBucket>, key: string): FileStatsBucket {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const created: FileStatsBucket = { files: 0, lines: 0 };
  map.set(key, created);
  return created;
}

function runCommand(
  command: string,
  args: string[],
  envOverrides?: Record<string, string>,
): string {
  const overrideEntries = Object.entries(envOverrides ?? {});
  const runCmd = overrideEntries.length > 0 ? 'env' : command;
  const runArgs = overrideEntries.length > 0
    ? [...overrideEntries.map(([key, value]) => `${key}=${value}`), command, ...args]
    : args;

  const result = spawnSync(runCmd, runArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    const details = [stderr, stdout].filter((part) => part.length > 0).join('\n');
    throw new Error(`Command failed: ${[command, ...args].join(' ')}${details ? `\n${details}` : ''}`);
  }

  return result.stdout;
}

function normalizeRelativePath(input: string): string {
  return input.split(path.sep).join('/').replace(/^\.\/+/, '');
}

function normalizeTestPath(input: string, baseDir: string): string {
  const normalizedInput = input.split(path.win32.sep).join(path.posix.sep);
  if (path.isAbsolute(normalizedInput)) {
    const relative = path.relative(repoRoot, normalizedInput);
    return normalizeRelativePath(relative);
  }

  if (normalizedInput.startsWith('tests/')) {
    return normalizeRelativePath(normalizedInput);
  }

  return normalizeRelativePath(path.posix.join(baseDir, normalizedInput));
}

function mapToSortedObject<T>(
  map: Map<string, T>,
  sortFn: (a: [string, T], b: [string, T]) => number,
  filterFn?: (entry: [string, T]) => boolean,
): Record<string, T> {
  const entries = [...map.entries()]
    .filter((entry) => (filterFn ? filterFn(entry) : true))
    .toSorted(sortFn);
  return Object.fromEntries(entries);
}

function totalsFromFileBuckets(byType: Record<string, FileStatsBucket>): { files: number; lines: number } {
  let files = 0;
  let lines = 0;

  for (const bucket of Object.values(byType)) {
    files += bucket.files;
    lines += bucket.lines;
  }

  return { files, lines };
}

function formatInt(value: number): string {
  return value.toLocaleString('en-US');
}

function printSummary(stats: RepoStats, comparison?: ComparisonResult, baseline?: RepoStats): void {
  const metricEntries = comparison
    ? comparison.metrics.map((metric) => [metric.id, metric] as const)
    : undefined;
  const metricMap = new Map(metricEntries);
  const hasBaseline = baseline !== undefined;

  process.stdout.write(`Repo stats (${stats.generatedAt})\n`);
  process.stdout.write('\n');
  process.stdout.write('Files by type (non-empty lines)\n');
  process.stdout.write(
    `  ${'Type'.padEnd(16)} ${'Files'.padStart(6)} ${'Lines'.padStart(9)}\n`,
  );
  const currentEntries = Object.entries(stats.files.byType);
  const seenTypes = new Set(currentEntries.map(([type]) => type));
  const baselineOnlyEntries = baseline
    ? Object.entries(baseline.files.byType)
      .filter(([type, bucket]) => !seenTypes.has(type) && (bucket.files > 0 || bucket.lines > 0))
      .toSorted((a, b) => a[0].localeCompare(b[0]))
    : [];
  const entriesToRender = [...currentEntries, ...baselineOnlyEntries];

  for (const [type, bucket] of entriesToRender) {
    const baselineBucket = baseline?.files.byType[type] ?? { files: 0, lines: 0 };
    const filesDelta = hasBaseline ? formatDeltaFromValues(bucket.files, baselineBucket.files) : '';
    const linesDelta = hasBaseline ? formatDeltaFromValues(bucket.lines, baselineBucket.lines) : '';
    process.stdout.write(
      `  ${type.padEnd(16)} ${formatInt(bucket.files).padStart(6)}${filesDelta} ${formatInt(bucket.lines).padStart(9)}${linesDelta}\n`,
    );
  }

  const filesTotalFilesMetric = metricMap.get('files.total.files');
  const filesTotalLinesMetric = metricMap.get('files.total.lines');
  const filesTotalFailed = Boolean(filesTotalFilesMetric?.failed || filesTotalLinesMetric?.failed);
  const filesTotalSuffix = filesTotalFailed ? ` ${colorize('FAIL', 'red')}` : '';

  process.stdout.write(
    `  ${'Total'.padEnd(16)} ${formatInt(stats.totals.files.files).padStart(6)}${formatDelta(filesTotalFilesMetric)} ${formatInt(stats.totals.files.lines).padStart(9)}${formatDelta(filesTotalLinesMetric)}${filesTotalSuffix}\n`,
  );

  process.stdout.write('\n');
  process.stdout.write('Test\n');
  process.stdout.write(
    `  unit: ${formatInt(stats.tests.unit)}${formatDelta(metricMap.get('tests.unit'))}\n`,
  );
  process.stdout.write(
    `  collab: ${formatInt(stats.tests.collab)}${formatDelta(metricMap.get('tests.collab'))}\n`,
  );
  process.stdout.write(
    `  e2e: ${formatInt(stats.tests.e2e)}${formatDelta(metricMap.get('tests.e2e'))}\n`,
  );

  const totalUniqueMetric = metricMap.get('tests.totalUnique');
  const totalUniqueSuffix = totalUniqueMetric?.failed ? ` ${colorize('FAIL', 'red')}` : '';
  process.stdout.write(
    `  Total (unique): ${formatInt(stats.tests.totalUnique)}${formatDelta(totalUniqueMetric)}${totalUniqueSuffix}\n`,
  );

  if (comparison && comparison.failedMetrics.length > 0) {
    process.stdout.write('\n');
    process.stdout.write(`${colorize('THRESHOLD VIOLATIONS', 'red')}\n`);
    for (const metric of comparison.failedMetrics) {
      process.stdout.write(
        `  ${colorize('!', 'red')} ${metric.label}: ${formatInt(metric.baseline)} -> ${formatInt(metric.current)} (${formatSignedInt(metric.delta)}, ${formatSignedPercent(metric.deltaPct)}, limit ${thresholdRatio * 100}%)\n`,
      );
    }
    process.stdout.write('  If expected, run: pnpm run stats:repo --update\n');
  }
}

function formatDelta(metric: ComparisonMetric | undefined): string {
  if (!metric || metric.delta === 0) {
    return '';
  }

  const body = ` (${formatSignedInt(metric.delta)}, ${formatSignedPercent(metric.deltaPct)})`;
  if (metric.delta > 0) {
    return colorize(body, 'green');
  }

  if (metric.delta < 0) {
    return colorize(body, 'red');
  }
  return '';
}

function formatDeltaFromValues(current: number, baseline: number): string {
  const delta = current - baseline;
  if (delta === 0) {
    return '';
  }
  const deltaPct = baseline === 0 ? null : (delta / baseline) * 100;
  const body = ` (${formatSignedInt(delta)}, ${formatSignedPercent(deltaPct)})`;
  if (delta > 0) {
    return colorize(body, 'green');
  }
  return colorize(body, 'red');
}

function formatSignedInt(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatInt(value)}`;
}

function formatSignedPercent(value: number | null): string {
  if (value == null) {
    return 'n/a';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function colorize(value: string, color: 'green' | 'red'): string {
  if (!process.stdout.isTTY) {
    return value;
  }

  const colorCode = color === 'green' ? '\u001B[32m' : '\u001B[31m';
  return `${colorCode}${value}\u001B[0m`;
}

function writeJson(targetPath: string, data: unknown): void {
  fs.writeFileSync(targetPath, `${JSON.stringify(data, null, 2)}\n`);
}
