import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import submittedPackage from './submitted-package-baseline.json';

const repoRoot = resolve('.');
const fixtures: string[] = [];

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture({ preserveManifest = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'remdo-openai-plugin-'));
  fixtures.push(directory);
  const root = join(directory, 'plugins/openai');
  const script = join(root, 'build.py');
  cpSync(join(repoRoot, 'plugins/openai'), root, { recursive: true, verbatimSymlinks: true });
  const icon = join(directory, 'public/icon-192.png');
  mkdirSync(join(directory, 'public'), { recursive: true });
  copyFileSync(join(repoRoot, 'public/icon-192.png'), icon);
  const manifestPath = join(root, 'plugin.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!preserveManifest) {
    manifest.version = '2.3.4';
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  }
  return { root, script, icon, output: join(directory, `data/plugins/openai/remdo-openai-${manifest.version}.zip`) };
}

function runPython(...args: string[]) {
  return execFileSync('python3', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

// Temporary compatibility freeze: this entire test pins the submitted OpenAI package.
// Retirement: docs/todo.md#temporary-mcp-compatibility-guards.
it('preserves the submitted OpenAI package contents', () => {
  const { root, script, output } = fixture({ preserveManifest: true });
  runPython(script);

  const extracted = join(root, 'extracted');
  runPython('-m', 'zipfile', '-e', output, extracted);
  const members = Object.fromEntries(readdirSync(extracted, { recursive: true, encoding: 'utf8' })
    .filter(path => statSync(join(extracted, path)).isFile())
    .map(path => [path, createHash('sha256').update(readFileSync(join(extracted, path))).digest('hex')]));

  expect(members).toEqual(submittedPackage.membersSha256);
});

it('packages only the upload files at the ZIP root and rebuilds identical bytes', () => {
  const { root, script, output } = fixture();
  writeFileSync(join(root, '.env'), 'SYNTHETIC_PRIVATE_VALUE=do-not-package\n');
  writeFileSync(join(root, 'assets/development.txt'), 'Development scratch\n');
  runPython(script);
  const firstBuild = readFileSync(output);

  const extracted = join(root, 'extracted');
  runPython('-m', 'zipfile', '-e', output, extracted);
  const files = readdirSync(extracted, { recursive: true, encoding: 'utf8' })
    .filter(path => statSync(join(extracted, path)).isFile())
    .sort();
  expect(files).toEqual(['LICENSE', 'assets/icon.png', 'mcp.json', 'plugin.json']);
  for (const path of ['plugin.json', 'mcp.json', 'assets/icon.png']) {
    expect(readFileSync(join(extracted, path))).toEqual(readFileSync(join(root, path)));
  }
  expect(readFileSync(join(extracted, 'LICENSE'))).toEqual(readFileSync(join(root, 'LICENSE')));

  utimesSync(join(root, 'plugin.json'), new Date('2030-01-01'), new Date('2030-01-01'));
  runPython(script);
  expect(readFileSync(output)).toEqual(firstBuild);
});

it('packages changes to the shared app icon without updating plugin sources', () => {
  const { root, script, icon, output } = fixture();
  const updated = readFileSync(join(repoRoot, 'public/icon-512.png'));
  writeFileSync(icon, updated);
  runPython(script);

  const extracted = join(root, 'extracted');
  runPython('-m', 'zipfile', '-e', output, extracted);
  expect(readFileSync(join(extracted, 'assets/icon.png'))).toEqual(updated);
});

it('includes the branding assets referenced by the manifest', () => {
  const { root, script, output } = fixture();
  const logo = readFileSync(join(repoRoot, 'public/icon-512.png'));
  writeFileSync(join(root, 'assets/listing.png'), logo);
  const manifestPath = join(root, 'plugin.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.extensions['com.openai'].interface.logo = './assets/listing.png';
  writeFileSync(manifestPath, JSON.stringify(manifest));
  runPython(script);

  const extracted = join(root, 'extracted');
  runPython('-m', 'zipfile', '-e', output, extracted);
  expect(readFileSync(join(extracted, 'assets/listing.png'))).toEqual(logo);
  expect(readFileSync(join(extracted, 'assets/icon.png'))).toEqual(readFileSync(join(root, 'assets/icon.png')));
});

it.each(['./assets/missing.png', './assets/../../private.png'])('refuses a missing or escaping branding asset %s before replacing the ZIP', (logo) => {
  const { root, script, output } = fixture();
  copyFileSync(join(repoRoot, 'public/icon-512.png'), join(root, '../private.png'));
  runPython(script);
  const previous = readFileSync(output);
  const manifestPath = join(root, 'plugin.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.extensions['com.openai'].interface.logo = logo;
  writeFileSync(manifestPath, JSON.stringify(manifest));

  const result = spawnSync('python3', [script], { cwd: repoRoot, encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(readFileSync(output)).toEqual(previous);
});

it('fails on a missing shared icon without replacing the last complete ZIP', () => {
  const { script, icon, output } = fixture();
  runPython(script);
  const previous = readFileSync(output);
  unlinkSync(icon);

  const result = spawnSync('python3', [script], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('icon.png');
  expect(readFileSync(output)).toEqual(previous);
});
