// Enforce the one-active-OpenSpec-change-per-branch contract.
// Usage:
//   pnpm exec tsx change-gate.ts start
//   pnpm exec tsx change-gate.ts continue <change-name>
import { spawnSync } from 'node:child_process';
import process from 'node:process';

function fail(message: string): never {
  process.stderr.write(`change-gate: ${message}\n`);
  process.exit(1);
}

const [mode, requested = '', ...extra] = process.argv.slice(2);

if (mode === 'start') {
  if (requested !== '' || extra.length > 0) {
    fail('start takes no change name');
  }
} else if (mode === 'continue') {
  if (requested === '' || extra.length > 0) {
    fail('continue requires one change name');
  }
} else {
  fail('usage: change-gate.ts start | continue <change-name>');
}

const gitRoot = spawnSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
});
if (gitRoot.status !== 0) {
  fail('not a git repository');
}
const root = gitRoot.stdout.trim();

const list = spawnSync('./tools/openspec', ['list', '--json'], {
  cwd: root,
  encoding: 'utf8',
});
if (list.status !== 0) {
  fail(`could not list OpenSpec changes: ${list.stderr.trim()}`);
}

let parsed: unknown;
try {
  parsed = JSON.parse(list.stdout);
} catch {
  fail('OpenSpec returned invalid JSON');
}

const changes = typeof parsed === 'object' && parsed !== null && 'changes' in parsed
  ? parsed.changes
  : [];
const names = Array.isArray(changes)
  ? changes.flatMap((change): string[] => {
      if (typeof change !== 'object' || change === null || !('name' in change)) {
        return [];
      }
      return typeof change.name === 'string' ? [change.name] : [];
    })
  : [];

if (mode === 'start') {
  if (names.length === 0) {
    process.stdout.write('STATE=ready\n');
    process.exit(0);
  }
  fail(
    `branch already has active OpenSpec change(s): ${names.join(', ')} — `
      + 'use a different branch',
  );
}

if (names.length !== 1 || names[0] !== requested) {
  fail(
    `expected sole active change ${requested}; found `
      + (names.length === 0 ? 'none' : names.join(', ')),
  );
}

process.stdout.write(`STATE=active\nCHANGE=${requested}\n`);
