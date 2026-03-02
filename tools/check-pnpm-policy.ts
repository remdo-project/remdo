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

try {
  const workspace = fs.readFileSync('pnpm-workspace.yaml', 'utf8').split(/\r?\n/u);
  const lockfile = fs.readFileSync('pnpm-lock.yaml', 'utf8').split(/\r?\n/u);

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

  process.stdout.write('pnpm policy entries are active\n');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
