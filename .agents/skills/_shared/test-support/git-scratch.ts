/* eslint-disable node/no-process-env */
// Scratch git-repo harness for the skill-script specs. Each script is
// spawned (`sh <script>`) against a throwaway repo built here: real commits,
// branches, and a bare `origin` remote so `origin/main` and `git fetch` behave
// as in production.
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { expect } from 'vitest';

// Deterministic identity + no signing, independent of the dev's global config.
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  // TMPDIR lives inside the repo (tools/env.defaults.sh), so a "non-repo"
  // scratch dir would let git walk up into the real repository; the ceiling
  // stops the walk at the temp root without affecting nested scratch repos.
  GIT_CEILING_DIRECTORIES: os.tmpdir(),
};

const tempDirs: string[] = [];

export function cleanupTempDirs(): void {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
}

// A tracked scratch dir under the temp root — cleaned by cleanupTempDirs() in
// each spec's afterEach, so specs never hand-roll their own dir bookkeeping.
export function makeDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

export function git(cwd: string, ...args: string[]): SpawnSyncReturns<string> {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv });
}

function gitOk(cwd: string, ...args: string[]): void {
  const result = git(cwd, ...args);
  expect(result.status, `git ${args.join(' ')}\n${result.stderr}`).toBe(0);
}

export function writeFile(dir: string, file: string, content: string): void {
  const absolute = path.join(dir, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

export function commitAll(dir: string, message: string): string {
  gitOk(dir, 'add', '--all');
  gitOk(dir, 'commit', '--quiet', '--message', message);
  return git(dir, 'rev-parse', 'HEAD').stdout.trim();
}

// A work repo cloned from a bare `origin` whose default branch is `main`, so
// `origin/main` is a genuine remote-tracking ref and `git fetch` reaches a real
// remote. Returns both paths; `origin` is where you push to advance main.
export interface Scratch {
  work: string;
  origin: string;
}

export function makeScratchWithOrigin(files: Record<string, string>): Scratch {
  const origin = makeDir('skills-origin-');
  gitOk(origin, 'init', '--quiet', '--bare', '--initial-branch=main');

  const seed = makeDir('skills-seed-');
  gitOk(seed, 'init', '--quiet', '--initial-branch=main');
  for (const [file, content] of Object.entries(files)) {
    writeFile(seed, file, content);
  }
  commitAll(seed, 'initial');
  gitOk(seed, 'remote', 'add', 'origin', origin);
  gitOk(seed, 'push', '--quiet', 'origin', 'main');

  const work = makeDir('skills-work-');
  gitOk(work, 'clone', '--quiet', origin, '.');
  return { work, origin };
}

// Advance origin/main by one commit, made from a throwaway second clone so a
// primary work repo cloned earlier stays behind until it fetches.
export function advanceOrigin(origin: string): void {
  const pusher = makeDir('skills-pusher-');
  gitOk(pusher, 'clone', '--quiet', origin, '.');
  writeFile(pusher, 'upstream.md', '# upstream\n');
  commitAll(pusher, 'upstream commit');
  gitOk(pusher, 'push', '--quiet', 'origin', 'main');
  fs.rmSync(pusher, { recursive: true, force: true });
}

// A throwaway directory that is not a git repository — for the scripts'
// "not a git repository" refusal. Rides the tracked-temp-dir cleanup like
// every other scratch dir (GIT_CEILING_DIRECTORIES stops git walking up into
// the real repo).
export function makeNonRepoDir(): string {
  return makeDir('skills-nogit-');
}

// A minimal repo with one commit on `main` and no `origin` remote — for the
// scripts' "not a task branch / origin/main missing" refusals.
export function makeBareMain(files: Record<string, string>): string {
  const dir = makeDir('skills-main-');
  gitOk(dir, 'init', '--quiet', '--initial-branch=main');
  for (const [file, content] of Object.entries(files)) {
    writeFile(dir, file, content);
  }
  commitAll(dir, 'initial');
  return dir;
}

export function runScript(
  script: string,
  cwd: string,
  args: string[] = [],
  extraPath?: string,
): SpawnSyncReturns<string> {
  const env = extraPath
    ? { ...gitEnv, PATH: `${extraPath}:${process.env.PATH}` }
    : gitEnv;
  return spawnSync('sh', [script, ...args], {
    cwd,
    encoding: 'utf8',
    env,
  });
}
