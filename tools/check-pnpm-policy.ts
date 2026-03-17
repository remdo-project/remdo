import fs from 'node:fs';
import process from 'node:process';

const unquote = (raw: string): string => {
  const value = raw.trim();
  return (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith('\'') && value.endsWith('\''))
  )
    ? value.slice(1, -1)
    : value;
};

const sectionLines = (lines: string[], section: string): string[] => {
  const start = lines.indexOf(`${section}:`);
  if (start === -1) {
    return [];
  }

  const scoped: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line && !line.startsWith(' ')) {
      break;
    }
    scoped.push(line);
  }
  return scoped;
};

const listItems = (lines: string[], section: string): string[] =>
  sectionLines(lines, section)
    .filter((line) => line.startsWith('  - '))
    .map((line) => unquote(line.slice(4)));

const mapEntries = (lines: string[], section: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const line of sectionLines(lines, section)) {
    if (!line.startsWith('  ') || line.startsWith('    ')) {
      continue;
    }
    const row = line.slice(2);
    const colon = row.indexOf(':');
    if (colon < 1) {
      continue;
    }
    out.set(unquote(row.slice(0, colon)), unquote(row.slice(colon + 1)));
  }
  return out;
};

const topLevelKeys = (lines: string[], section: string): Set<string> => {
  const out = new Set<string>();
  for (const line of sectionLines(lines, section)) {
    if (!line.startsWith('  ') || line.startsWith('    ')) {
      continue;
    }
    const row = line.slice(2).trimEnd();
    if (row.endsWith(':')) {
      out.add(unquote(row.slice(0, -1)));
    }
  }
  return out;
};

const capture = (source: string, pattern: RegExp, description: string): string => {
  const match = source.match(pattern);
  const value = match?.[1]?.trim();
  if (!value) {
    throw new Error(`missing ${description}`);
  }
  return value;
};

const normalizeNodeSeries = (raw: string, description: string): string => {
  const match = raw.trim().match(/^(\d+\.\d+)/u);
  const value = match?.[1];
  if (!value) {
    throw new Error(`unsupported ${description}: ${raw}`);
  }
  return value;
};

try {
  const workspaceRaw = fs.readFileSync('pnpm-workspace.yaml', 'utf8');
  const workspace = workspaceRaw.split(/\r?\n/u);
  const lockfile = fs.readFileSync('pnpm-lock.yaml', 'utf8').split(/\r?\n/u);
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
    engines?: {
      node?: string;
    };
  };
  const setupPnpm = fs.readFileSync('.github/actions/setup-pnpm/action.yml', 'utf8');
  const dockerfile = fs.readFileSync('docker/Dockerfile', 'utf8');

  const lockKeys = new Set([...topLevelKeys(lockfile, 'packages'), ...topLevelKeys(lockfile, 'snapshots')]);
  for (const entry of listItems(workspace, 'trustPolicyExclude')) {
    if (!lockKeys.has(entry)) {
      throw new Error(`stale trustPolicyExclude entry: ${entry}`);
    }
  }

  const lockOverrides = mapEntries(lockfile, 'overrides');
  for (const [key, value] of mapEntries(workspace, 'overrides')) {
    if (lockOverrides.get(key) !== value) {
      throw new Error(`stale override entry: ${key}`);
    }
  }

  const packageNode = packageJson.engines?.node;
  if (!packageNode) {
    throw new Error('missing package.json engines.node');
  }
  const expectedNodeSeries = normalizeNodeSeries(packageNode, 'package.json engines.node');

  const ciNodeSeries = normalizeNodeSeries(
    capture(setupPnpm, /node-version:\s*([^\n]+)/u, '.github/actions/setup-pnpm/action.yml node-version'),
    '.github/actions/setup-pnpm/action.yml node-version',
  );
  if (ciNodeSeries !== expectedNodeSeries) {
    throw new Error(`Node version drift: setup-pnpm uses ${ciNodeSeries}, package.json expects ${expectedNodeSeries}`);
  }

  const dockerNodeTags = [...dockerfile.matchAll(/^FROM node:(\d+\.\d+)-alpine AS (\w+)$/gmu)];
  if (dockerNodeTags.length === 0) {
    throw new Error('missing docker Node base images');
  }
  for (const [, dockerNodeSeries, stageName] of dockerNodeTags) {
    if (dockerNodeSeries !== expectedNodeSeries) {
      throw new Error(`Node version drift: docker ${stageName} uses ${dockerNodeSeries}, package.json expects ${expectedNodeSeries}`);
    }
  }

  const workspaceCatalog = mapEntries(workspace, 'catalog');
  const workspaceYSweet = workspaceCatalog.get('y-sweet');
  if (!workspaceYSweet) {
    throw new Error('missing pnpm-workspace.yaml catalog y-sweet entry');
  }
  const dockerYSweet = capture(dockerfile, /^ENV YSWEET_VERSION=(.+)$/mu, 'docker YSWEET_VERSION');
  if (dockerYSweet !== workspaceYSweet) {
    throw new Error(`y-sweet version drift: docker uses ${dockerYSweet}, pnpm-workspace.yaml expects ${workspaceYSweet}`);
  }

  process.stdout.write('pnpm policy entries are active\n');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
