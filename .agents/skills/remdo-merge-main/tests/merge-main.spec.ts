// merge-main.sh owns deterministic target pinning, integration, preservation,
// continuation, and restoration for remdo-merge-main.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  advanceOrigin,
  cleanupTempDirs,
  commitAll,
  git,
  makeBareMain,
  makeDir,
  makeNonRepoDir,
  makeScratchWithOrigin,
  runScript,
  writeFile,
} from '../../_shared/test-support/git-scratch';

const script = path.join(__dirname, '../tools/merge-main.sh');
const run = (cwd: string, ...args: string[]) => runScript(script, cwd, args);
const value = (stdout: string, key: string) =>
  stdout.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1];
const stateDir = (cwd: string) =>
  git(
    cwd,
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'remdo-merge-main',
  ).stdout.trim();

function pushChange(
  origin: string,
  files: Record<string, string>,
  message = 'upstream change',
): void {
  const pusher = makeDir('skills-pusher-');
  expect(git(pusher, 'clone', '--quiet', origin, '.').status).toBe(0);
  for (const [file, content] of Object.entries(files)) {
    writeFile(pusher, file, content);
  }
  commitAll(pusher, message);
  expect(git(pusher, 'push', '--quiet', 'origin', 'main').status).toBe(0);
}

afterEach(cleanupTempDirs);

describe('merge-main.sh', () => {
  it('reports idle before a run and leaves an up-to-date branch unchanged', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const before = git(work, 'rev-parse', 'HEAD').stdout;

    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
    const result = run(work, 'start');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('up-to-date');
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(before);
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('fast-forwards to the fixed target without leaving run state', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    pushChange(origin, { 'later.md': '# later\n' }, 'later upstream change');
    expect(
      git(work, 'config', 'branch.main.mergeOptions', '--squash').status,
    ).toBe(0);

    const result = run(work, 'start');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('fast-forwarded');
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(
      git(origin, 'rev-parse', 'main').stdout,
    );
    expect(value(result.stdout, 'TARGET')).toBe(
      git(origin, 'rev-parse', 'main').stdout.trim(),
    );
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('reports a completed fast-forward despite a post-merge tree change', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    pushChange(origin, { 'later.md': '# later\n' }, 'later upstream change');
    const bin = makeDir('skills-fast-forward-post-check-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = merge ] && [ "$2" = --quiet ] && [ "$3" = --ff-only ]; then',
        '  PATH=${PATH#*:}',
        '  export PATH',
        '  git "$@"',
        '  status=$?',
        `  printf 'post-merge change\\n' > ${JSON.stringify(path.join(work, 'post-merge.md'))}`,
        '  exit "$status"',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const result = runScript(script, work, ['start'], bin);

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('fast-forwarded');
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(
      git(origin, 'rev-parse', 'main').stdout,
    );
    expect(fs.readFileSync(path.join(work, 'post-merge.md'), 'utf8')).toBe(
      'post-merge change\n',
    );
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('fetches main independently of the configured remote refspec', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    expect(
      git(
        work,
        'config',
        'remote.origin.fetch',
        '+refs/heads/other:refs/remotes/origin/other',
      ).status,
    ).toBe(0);
    pushChange(origin, { 'later.md': '# later\n' }, 'later upstream change');

    const result = run(work, 'start');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('fast-forwarded');
    expect(value(result.stdout, 'TARGET')).toBe(
      git(origin, 'rev-parse', 'main').stdout.trim(),
    );
    expect(git(work, 'rev-parse', 'origin/main').stdout).toBe(
      git(origin, 'rev-parse', 'main').stdout,
    );
  });

  it('seeds the isolated fetch with the previous main tip', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const previousMain = git(work, 'rev-parse', 'origin/main').stdout.trim();
    pushChange(origin, { 'later.md': '# later\n' }, 'later upstream change');
    const bin = makeDir('skills-fetch-negotiation-wrapper-');
    const marker = path.join(bin, 'negotiation-tip');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = fetch ]; then',
        '  PATH=${PATH#*:}',
        '  export PATH',
        `  git rev-parse --verify refs/remdo-merge-main/negotiation > ${JSON.stringify(marker)}`,
        '  exec git "$@"',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const result = runScript(script, work, ['start'], bin);

    expect(result.status).toBe(0);
    expect(fs.readFileSync(marker, 'utf8').trim()).toBe(previousMain);
    expect(value(result.stdout, 'STATE')).toBe('fast-forwarded');
  });

  it('fetches into a shallow checkout without changing its boundary', () => {
    const { origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    advanceOrigin(origin);
    const work = makeDir('skills-shallow-work-');
    expect(
      git(work, 'clone', '--quiet', '--depth', '1', `file://${origin}`, '.')
        .status,
    ).toBe(0);
    const shallowFile = git(
      work,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'shallow',
    ).stdout.trim();
    const boundary = fs.readFileSync(shallowFile, 'utf8');
    pushChange(origin, { 'later.md': '# later\n' }, 'later upstream change');

    const result = run(work, 'start');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('fast-forwarded');
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(
      git(origin, 'rev-parse', 'main').stdout,
    );
    expect(fs.readFileSync(shallowFile, 'utf8')).toBe(boundary);
  });

  it('keeps the target pinned when another fetch replaces FETCH_HEAD', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const pusher = makeDir('skills-other-pusher-');
    expect(git(pusher, 'clone', '--quiet', origin, '.').status).toBe(0);
    expect(git(pusher, 'switch', '--quiet', '-c', 'other').status).toBe(0);
    writeFile(pusher, 'other.md', '# other\n');
    commitAll(pusher, 'other branch');
    expect(git(pusher, 'push', '--quiet', 'origin', 'other').status).toBe(0);
    pushChange(origin, { 'later.md': '# later\n' }, 'later upstream change');
    const bin = makeDir('skills-concurrent-fetch-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = fetch ]; then',
        '  PATH=${PATH#*:}',
        '  export PATH',
        '  git "$@"',
        '  status=$?',
        '  if [ "$status" -eq 0 ]; then',
        '    (unset GIT_DIR GIT_OBJECT_DIRECTORY',
        '     git fetch --quiet origin refs/heads/other)',
        '  fi',
        '  exit "$status"',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const result = runScript(script, work, ['start'], bin);

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'TARGET')).toBe(
      git(origin, 'rev-parse', 'main').stdout.trim(),
    );
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(
      git(origin, 'rev-parse', 'main').stdout,
    );
    expect(git(work, 'rev-parse', 'FETCH_HEAD').stdout).toBe(
      git(origin, 'rev-parse', 'other').stdout,
    );
    expect(
      git(work, 'for-each-ref', 'refs/remdo-merge-main').stdout,
    ).toBe('');
  });

  it('ignores an incomplete unpublished state directory', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const incomplete = `${stateDir(work)}-initial-dead`;
    fs.mkdirSync(incomplete);
    writeFile(incomplete, 'branch', 'partial\n');

    const result = run(work, 'start');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('up-to-date');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('does not reuse an unpublished state directory from an older PID', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const wrapperDir = makeDir('skills-initial-state-collision-');
    const wrapper = path.join(wrapperDir, 'run.sh');
    writeFile(
      wrapperDir,
      'run.sh',
      [
        '#!/usr/bin/env sh',
        'state=$(git rev-parse --path-format=absolute --git-path remdo-merge-main)',
        'mkdir "$state-initial-$$"',
        'exec sh "$MERGE_MAIN_SCRIPT" start',
        '',
      ].join('\n'),
    );
    fs.chmodSync(wrapper, 0o755);

    const result = runScript(wrapper, work, [], undefined, {
      MERGE_MAIN_SCRIPT: script,
    });

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('up-to-date');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('publishes no saved ref when run-state initialization fails', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-state-publish-wrapper-');
    const mvWrapper = path.join(bin, 'mv');
    writeFile(
      bin,
      'mv',
      [
        '#!/usr/bin/env sh',
        'for argument do destination=$argument; done',
        'if [ "$1" = -T ] && [ "${destination##*/}" = remdo-merge-main ]; then',
        '  exit 91',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec mv "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(mvWrapper, 0o755);

    const result = runScript(
      script,
      work,
      ['start', '--preserve'],
      bin,
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('another remdo-merge-main run');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
    expect(
      git(work, 'for-each-ref', 'refs/remdo-merge-main').stdout,
    ).toBe('');
    expect(
      fs.globSync(`${stateDir(work)}-initial-*`),
    ).toHaveLength(0);
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('saved work\n');
  });

  it('holds a merge commit for verification and keeps its target pinned', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);

    const started = run(work, 'start');
    const target = value(started.stdout, 'TARGET');

    expect(started.status).toBe(0);
    expect(value(started.stdout, 'STATE')).toBe('verification-needed');
    expect(
      git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').stdout.trim().split(' '),
    ).toHaveLength(3);

    pushChange(origin, { 'later.md': '# later\n' }, 'later upstream change');
    const status = run(work, 'status');
    expect(value(status.stdout, 'TARGET')).toBe(target);
    expect(value(status.stdout, 'STATE')).toBe('verification-needed');

    const finished = run(work, 'finish');
    expect(value(finished.stdout, 'STATE')).toBe('merged');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('records verification failure as the terminal result', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(value(run(work, 'start').stdout, 'STATE')).toBe(
      'verification-needed',
    );

    const finished = run(work, 'finish', '--verification-failed');

    expect(finished.status).toBe(0);
    expect(value(finished.stdout, 'STATE')).toBe('verification-failed');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('refuses to finish an uncommitted integration state', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(value(run(work, 'start').stdout, 'STATE')).toBe(
      'verification-needed',
    );
    writeFile(work, 'unfinished.md', '# unfinished\n');

    const finished = run(work, 'finish', '--verification-failed');

    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('not clean and committed');
    expect(value(run(work, 'status').stdout, 'STATE')).toBe(
      'verification-needed',
    );
    expect(git(work, 'clean', '-f', '--quiet').status).toBe(0);
    expect(value(run(work, 'finish').stdout, 'STATE')).toBe('merged');
  });

  it('refuses to finish after the branch loses its original head', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    const started = run(work, 'start');
    expect(value(started.stdout, 'STATE')).toBe('verification-needed');
    const target = value(started.stdout, 'TARGET')!;
    expect(git(work, 'reset', '--hard', '--quiet', target).status).toBe(0);

    const finished = run(work, 'finish');

    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('no longer contains its original head');
    expect(value(run(work, 'status').stdout, 'STATE')).toBe('stopped');
    expect(value(run(work, 'stop').stdout, 'STATE')).toBe('stopped');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('rejects an empty required state value without clearing the run', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(value(run(work, 'start').stdout, 'STATE')).toBe(
      'verification-needed',
    );
    fs.writeFileSync(path.join(stateDir(work), 'outcome'), '');

    const finished = run(work, 'finish');

    expect(finished.status).not.toBe(0);
    expect(finished.stderr).toContain('run state is incomplete: empty outcome');
    expect(fs.existsSync(stateDir(work))).toBe(true);
  });

  it('clears completed state while retaining unexpected entries', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(value(run(work, 'start').stdout, 'STATE')).toBe(
      'verification-needed',
    );
    writeFile(stateDir(work), 'unexpected', 'retain\n');

    const finished = run(work, 'finish');

    expect(finished.status).toBe(0);
    expect(value(finished.stdout, 'STATE')).toBe('merged');
    expect(finished.stderr).toContain('retained unexpected run-state entries');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
    expect(
      fs.globSync(`${stateDir(work)}-leftovers-*`),
    ).toHaveLength(1);
  });

  it('clears an interrupted state-field publication', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(value(run(work, 'start').stdout, 'STATE')).toBe(
      'verification-needed',
    );
    writeFile(stateDir(work), '.outcome-dead', 'partial\n');

    const finished = run(work, 'finish');

    expect(finished.status).toBe(0);
    expect(value(finished.stdout, 'STATE')).toBe('merged');
    expect(finished.stderr).not.toContain(
      'retained unexpected run-state entries',
    );
    expect(
      fs.globSync(`${stateDir(work)}-leftovers-*`),
    ).toHaveLength(0);
  });

  it('retains unexpected state beside an older leftover directory', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(value(run(work, 'start').stdout, 'STATE')).toBe(
      'verification-needed',
    );
    const wrapperDir = makeDir('skills-leftover-collision-');
    const wrapper = path.join(wrapperDir, 'run.sh');
    writeFile(
      wrapperDir,
      'run.sh',
      [
        '#!/usr/bin/env sh',
        'state=$(git rev-parse --path-format=absolute --git-path remdo-merge-main)',
        'mkdir "$state-leftovers-$$"',
        'printf "retain\\n" >"$state/unexpected"',
        'exec sh "$MERGE_MAIN_SCRIPT" finish',
        '',
      ].join('\n'),
    );
    fs.chmodSync(wrapper, 0o755);

    const finished = runScript(wrapper, work, [], undefined, {
      MERGE_MAIN_SCRIPT: script,
    });

    expect(finished.status).toBe(0);
    expect(value(finished.stdout, 'STATE')).toBe('merged');
    const retained = fs.globSync(`${stateDir(work)}-leftovers-*`)
      .filter(dir => fs.existsSync(path.join(dir, 'unexpected')));
    expect(retained).toHaveLength(1);
    expect(fs.readFileSync(path.join(retained[0]!, 'unexpected'), 'utf8')).toBe(
      'retain\n',
    );
  });

  it('retires completed state before deleting its fields', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const bin = makeDir('skills-state-clear-wrapper-');
    const rmWrapper = path.join(bin, 'rm');
    writeFile(
      bin,
      'rm',
      [
        '#!/usr/bin/env sh',
        'case "$*" in',
        '  *remdo-merge-main*/branch*)',
        '    PATH=${PATH#*:}',
        '    export PATH',
        '    rm "$@"',
        '    kill -KILL "$PPID"',
        '    exit 0',
        '    ;;',
        'esac',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec rm "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(rmWrapper, 0o755);

    const interrupted = runScript(script, work, ['start'], bin);

    expect(interrupted.status).not.toBe(0);
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
    expect(value(run(work, 'start').stdout, 'STATE')).toBe('up-to-date');
  });

  it('persists a recovered verification phase after merge interruption', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(value(run(work, 'start').stdout, 'STATE')).toBe(
      'verification-needed',
    );
    writeFile(stateDir(work), 'phase', 'merging\n');

    const recovered = run(work, 'status');

    expect(value(recovered.stdout, 'STATE')).toBe('verification-needed');
    expect(
      fs.readFileSync(path.join(stateDir(work), 'phase'), 'utf8'),
    ).toBe('verification\n');
    expect(value(run(work, 'finish').stdout, 'STATE')).toBe('merged');
  });

  it('keeps the prior phase when its replacement is interrupted', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    const bin = makeDir('skills-phase-publish-wrapper-');
    const mvWrapper = path.join(bin, 'mv');
    writeFile(
      bin,
      'mv',
      [
        '#!/usr/bin/env sh',
        'case "${3-}" in',
        '  */remdo-merge-main/phase)',
        '    kill -KILL "$PPID"',
        '    exit 91',
        '    ;;',
        'esac',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec mv "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(mvWrapper, 0o755);

    const interrupted = runScript(script, work, ['start'], bin);

    expect(interrupted.status).not.toBe(0);
    expect(value(run(work, 'status').stdout, 'STATE')).toBe(
      'integration-ready',
    );
    expect(value(run(work, 'continue').stdout, 'STATE')).toBe(
      'verification-needed',
    );
  });

  it('reintegrates the fixed target after verification resets to the start', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(value(run(work, 'start').stdout, 'STATE')).toBe(
      'verification-needed',
    );
    const startHead = fs.readFileSync(
      path.join(stateDir(work), 'start-head'),
      'utf8',
    ).trim();
    expect(git(work, 'reset', '--hard', '--quiet', startHead).status).toBe(0);

    expect(value(run(work, 'status').stdout, 'STATE')).toBe(
      'integration-ready',
    );
    expect(value(run(work, 'continue').stdout, 'STATE')).toBe(
      'verification-needed',
    );
  });

  it('retries integration interrupted before the branch changes', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    const bin = makeDir('skills-merge-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'is_merge=no',
        'for argument do',
        '  [ "$argument" != merge ] || is_merge=yes',
        'done',
        'if [ "$is_merge" = yes ]; then',
        '  kill -KILL "$PPID"',
        '  exit 91',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const interrupted = runScript(script, work, ['start'], bin);

    expect(interrupted.status).not.toBe(0);
    expect(value(run(work, 'status').stdout, 'STATE')).toBe(
      'integration-ready',
    );
    writeFile(work, 'unexpected.md', 'dirty\n');
    const dirty = run(work, 'continue');
    expect(dirty.status).not.toBe(0);
    expect(dirty.stderr).toContain('integration state is not clean');
    fs.rmSync(path.join(work, 'unexpected.md'));
    expect(value(run(work, 'continue').stdout, 'STATE')).toBe(
      'verification-needed',
    );
  });

  it('stops an interrupted preserved run after the branch changes', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    writeFile(work, 'dirty.md', 'saved work\n');
    const bin = makeDir('skills-preserved-merge-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = merge ]; then kill -KILL "$PPID"; exit 91; fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);
    expect(
      runScript(script, work, ['start', '--preserve'], bin).status,
    ).not.toBe(0);
    writeFile(work, 'later.md', 'later\n');
    commitAll(work, 'later');

    expect(value(run(work, 'status').stdout, 'STATE')).toBe('stopped');
    const stopped = run(work, 'stop');
    expect(value(stopped.stdout, 'STATE')).toBe('stopped');
    expect(fs.readFileSync(path.join(work, 'dirty.md'), 'utf8')).toBe(
      'saved work\n',
    );
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('continues an interrupted fast-forward without verification', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    advanceOrigin(origin);
    const bin = makeDir('skills-fast-forward-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'is_merge=no',
        'for argument do',
        '  [ "$argument" != merge ] || is_merge=yes',
        'done',
        'if [ "$is_merge" = yes ]; then',
        '  PATH=${PATH#*:}',
        '  export PATH',
        '  git "$@"',
        '  status=$?',
        '  kill -KILL "$PPID"',
        '  exit "$status"',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const interrupted = runScript(script, work, ['start'], bin);

    expect(interrupted.status).not.toBe(0);
    expect(value(run(work, 'continue').stdout, 'STATE')).toBe('finish-needed');
    expect(value(run(work, 'finish').stdout, 'STATE')).toBe('fast-forwarded');
  });

  it('stops ready-to-restore work after a fast-forward is lost', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const startHead = git(work, 'rev-parse', 'HEAD').stdout.trim();
    advanceOrigin(origin);
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-ready-to-restore-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = merge ]; then',
        '  PATH=${PATH#*:}',
        '  export PATH',
        '  git "$@"',
        '  status=$?',
        '  kill -KILL "$PPID"',
        '  exit "$status"',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    expect(
      runScript(script, work, ['start', '--preserve'], bin).status,
    ).not.toBe(0);
    expect(value(run(work, 'status').stdout, 'STATE')).toBe('finish-needed');
    expect(git(work, 'reset', '--hard', '--quiet', startHead).status).toBe(0);

    expect(value(run(work, 'status').stdout, 'STATE')).toBe('stopped');
    expect(value(run(work, 'stop').stdout, 'STATE')).toBe('stopped');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('saved work\n');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('completes an interrupted fast-forward checkout', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    advanceOrigin(origin);
    const bin = makeDir('skills-partial-fast-forward-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = merge ]; then',
        '  for argument do target=$argument; done',
        '  PATH=${PATH#*:}',
        '  export PATH',
        '  git read-tree -u "$target"',
        '  kill -KILL "$PPID"',
        '  exit 91',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const interrupted = runScript(script, work, ['start'], bin);

    expect(interrupted.status).not.toBe(0);
    expect(value(run(work, 'status').stdout, 'STATE')).toBe(
      'integration-ready',
    );
    const hookMarker = path.join(work, '.git', 'post-merge-marker');
    const hook = git(
      work,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'hooks/post-merge',
    ).stdout.trim();
    fs.writeFileSync(
      hook,
      `#!/usr/bin/env sh\nprintf '%s\\n' "$1" > ${JSON.stringify(hookMarker)}\n`,
    );
    fs.chmodSync(hook, 0o755);
    writeFile(work, 'untracked.md', 'untracked\n');
    const dirty = run(work, 'continue');
    expect(dirty.status).not.toBe(0);
    expect(dirty.stderr).toContain('integration state is not clean');
    fs.rmSync(path.join(work, 'untracked.md'));
    expect(value(run(work, 'continue').stdout, 'STATE')).toBe(
      'fast-forwarded',
    );
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(
      git(origin, 'rev-parse', 'main').stdout,
    );
    expect(fs.readFileSync(hookMarker, 'utf8')).toBe('0\n');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('refuses dirty work unless preserve mode is explicit', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'a.md', '# dirty\n');

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('working tree is dirty');
    expect(git(work, 'diff', '--', 'a.md').stdout).toContain('# dirty');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('allows clean preserve mode to enter merge conflict resolution', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });

    const result = run(work, 'start', '--preserve');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('conflicted');
    expect(value(run(work, 'status').stdout, 'STATE')).toBe('conflicted');
  });

  it('preserves staged, unstaged, and untracked work across a fast-forward', () => {
    const { work, origin } = makeScratchWithOrigin({
      'staged.md': '# staged\n',
      'unstaged.md': '# unstaged\n',
    });
    advanceOrigin(origin);
    writeFile(work, 'staged.md', '# staged local\n');
    expect(git(work, 'add', 'staged.md').status).toBe(0);
    writeFile(work, 'unstaged.md', '# unstaged local\n');
    writeFile(work, 'untracked.md', '# untracked\n');

    const result = run(work, 'start', '--preserve');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('fast-forwarded');
    expect(result.stdout.startsWith('STATE=fast-forwarded\n')).toBe(true);
    expect(git(work, 'diff', '--cached', '--name-only').stdout.trim()).toBe(
      'staged.md',
    );
    expect(git(work, 'diff', '--name-only').stdout.trim()).toBe('unstaged.md');
    expect(
      git(work, 'ls-files', '--others', '--exclude-standard').stdout.trim(),
    ).toBe('untracked.md');
    expect(git(work, 'stash', 'list').stdout).toBe('');
    expect(
      git(work, 'for-each-ref', 'refs/remdo-merge-main').stdout,
    ).toBe('');
  });

  it('does not replace an existing empty run-state directory', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    const bin = makeDir('skills-concurrent-state-wrapper-');
    const mvWrapper = path.join(bin, 'mv');
    writeFile(
      bin,
      'mv',
      [
        '#!/usr/bin/env sh',
        'for argument do destination=$argument; done',
        'if [ "$1" = -T ] && [ "${destination##*/}" = remdo-merge-main ]; then',
        '  mkdir "$destination"',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec mv "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(mvWrapper, 0o755);

    const result = runScript(script, work, ['start'], bin);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'another remdo-merge-main run started concurrently',
    );
    expect(fs.readdirSync(stateDir(work))).toHaveLength(0);
  });

  it('preflights branch conflicts before preserving dirty work', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });
    writeFile(work, 'dirty.md', 'dirty\n');

    const result = run(work, 'start', '--preserve');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not merge cleanly');
    expect(git(work, 'stash', 'list').stdout).toBe('');
    expect(
      git(work, 'ls-files', '--others', '--exclude-standard').stdout.trim(),
    ).toBe('dirty.md');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('reports fetch failure through the runner diagnostic', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    expect(
      git(work, 'remote', 'set-url', 'origin', '/nonexistent/repository.git')
        .status,
    ).toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('merge-main: could not fetch origin');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('does not adopt an older stash when dirty submodule work is not stashable', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const submodule = makeBareMain({ 'nested.md': '# nested\n' });
    expect(
      git(
        work,
        '-c',
        'protocol.file.allow=always',
        'submodule',
        'add',
        '--quiet',
        submodule,
        'nested',
      ).status,
    ).toBe(0);
    commitAll(work, 'add submodule');
    writeFile(work, 'a.md', '# older stash\n');
    expect(git(work, 'stash', 'push', '--quiet').status).toBe(0);
    const olderStash = git(work, 'rev-parse', 'refs/stash').stdout;
    writeFile(path.join(work, 'nested'), 'nested.md', '# dirty nested\n');

    const result = run(work, 'start', '--preserve');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('could not be preserved');
    expect(git(work, 'rev-parse', 'refs/stash').stdout).toBe(olderStash);
    expect(
      git(path.join(work, 'nested'), 'diff', '--name-only').stdout.trim(),
    ).toBe('nested.md');
    expect(
      git(work, 'for-each-ref', 'refs/remdo-merge-main').stdout,
    ).toBe('');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('stops safely when local work cannot be stashed', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-stash-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = stash ] && [ "$2" = push ]; then',
        '  exit 91',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const interrupted = runScript(
      script,
      work,
      ['start', '--preserve'],
      bin,
    );

    expect(interrupted.status).not.toBe(0);
    expect(value(interrupted.stdout, 'STATE')).toBe('stopped');
    expect(interrupted.stderr).toContain('could not be preserved');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
    expect(git(work, 'diff', '--name-only').stdout.trim()).toBe('a.md');
    expect(git(work, 'stash', 'list').stdout).toBe('');
    expect(
      git(work, 'for-each-ref', 'refs/remdo-merge-main').stdout,
    ).toBe('');
  });

  it('restores a valid stash when its cleanup reports failure', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-stash-cleanup-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = stash ] && [ "$2" = push ]; then',
        '  PATH=${PATH#*:}',
        '  export PATH',
        '  git "$@"',
        '  [ "$?" -ne 0 ] || exit 91',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const result = runScript(
      script,
      work,
      ['start', '--preserve'],
      bin,
    );

    expect(result.status).not.toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('stopped');
    expect(result.stderr).toContain('saved but cleanup failed');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('saved work\n');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
    expect(
      git(work, 'for-each-ref', 'refs/remdo-merge-main').stdout,
    ).toBe('');
  });

  it('stops safely after its private stash was created', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    const exclude = git(
      work,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'info/exclude',
    ).stdout.trim();
    fs.appendFileSync(exclude, 'runtime/\n');
    writeFile(work, 'runtime/state', 'ignored\n');
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-stash-drop-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = stash ] && [ "$2" = push ]; then',
        '  PATH=${PATH#*:}',
        '  export PATH',
        '  git "$@"',
        '  status=$?',
        '  if [ "$status" -eq 0 ]; then',
        '    git pack-refs --all',
        '    kill -KILL "$PPID"',
        '  fi',
        '  exit "$status"',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const interrupted = runScript(
      script,
      work,
      ['start', '--preserve'],
      bin,
    );

    expect(interrupted.status).not.toBe(0);
    expect(value(run(work, 'status').stdout, 'STATE')).toBe(
      'preservation-needed',
    );
    expect(fs.readFileSync(path.join(work, 'runtime/state'), 'utf8')).toBe(
      'ignored\n',
    );
    const cherryPickHead = git(
      work,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'CHERRY_PICK_HEAD',
    ).stdout.trim();
    writeFile(path.dirname(cherryPickHead), path.basename(cherryPickHead), 'x\n');
    const operation = run(work, 'continue');
    expect(operation.status).not.toBe(0);
    expect(operation.stderr).toContain('another Git operation');
    fs.rmSync(cherryPickHead);
    writeFile(work, 'unexpected.md', 'changed branch\n');
    commitAll(work, 'changed branch');
    const changed = run(work, 'continue');
    expect(changed.status).not.toBe(0);
    expect(changed.stderr).toContain(
      'branch changed before preservation completed',
    );
    expect(value(run(work, 'status').stdout, 'STATE')).toBe('stopped');
    expect(value(run(work, 'stop').stdout, 'STATE')).toBe('stopped');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('saved work\n');
    expect(git(work, 'stash', 'list').stdout).toBe('');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
    expect(
      git(work, 'for-each-ref', 'refs/remdo-merge-main').stdout,
    ).toBe('');
  });

  it('reuses the ignored-path snapshot when private stash creation resumes', () => {
    const { work } = makeScratchWithOrigin({
      '.gitignore': 'existing/\n',
      'a.md': 'base\n',
    });
    fs.appendFileSync(path.join(work, '.gitignore'), 'newbuild/\n');
    writeFile(work, 'newbuild/output', 'ignored output\n');
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-ignored-stash-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = stash ] && [ "$2" = push ]; then',
        '  PATH=${PATH#*:}',
        '  export PATH',
        '  git "$@"',
        '  status=$?',
        '  [ "$status" -ne 0 ] || kill -KILL "$PPID"',
        '  exit "$status"',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    expect(
      runScript(script, work, ['start', '--preserve'], bin).status,
    ).not.toBe(0);
    const continued = run(work, 'continue');

    expect(value(continued.stdout, 'STATE')).toBe('up-to-date');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('saved work\n');
    expect(fs.readFileSync(path.join(work, 'newbuild/output'), 'utf8')).toBe(
      'ignored output\n',
    );
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('resumes when private saved-work ref cleanup fails', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-private-ref-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = update-ref ] && [ "$2" = -d ]; then',
        '  case "$3" in',
        '    refs/remdo-merge-main/private-*) exit 91 ;;',
        '  esac',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const interrupted = runScript(
      script,
      work,
      ['start', '--preserve'],
      bin,
    );

    expect(interrupted.status).not.toBe(0);
    expect(interrupted.stderr).toContain('private saved-work ref');
    expect(value(run(work, 'status').stdout, 'STATE')).toBe(
      'preservation-needed',
    );
    expect(value(run(work, 'continue').stdout, 'STATE')).toBe('up-to-date');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('saved work\n');
    expect(
      git(work, 'for-each-ref', 'refs/remdo-merge-main').stdout,
    ).toBe('');
  });

  it('recovers past an ownerless legacy preservation lock', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    const commonDir = git(
      work,
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ).stdout.trim();
    fs.mkdirSync(path.join(commonDir, 'remdo-merge-main-stash.lock'));
    writeFile(work, 'a.md', 'saved work\n');

    const result = run(work, 'start', '--preserve');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('up-to-date');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('saved work\n');
  });

  it('matches only the exact saved-work stash marker', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    const wrapperDir = makeDir('skills-stash-marker-prefix-');
    const wrapper = path.join(wrapperDir, 'run.sh');
    writeFile(
      wrapperDir,
      'run.sh',
      [
        '#!/usr/bin/env sh',
        'target=$(git rev-parse origin/main)',
        'git_dir=$(git rev-parse --path-format=absolute --git-dir)',
        'worktree_id=$(printf "%s\\n" "$git_dir" | git hash-object --stdin)',
        'marker="remdo-merge-main-saved-$target-$worktree_id-1"',
        'printf "other work\\n" >a.md',
        'git stash push --quiet --message "$marker"',
        'printf "current work\\n" >a.md',
        'exec sh "$MERGE_MAIN_SCRIPT" start --preserve',
        '',
      ].join('\n'),
    );
    fs.chmodSync(wrapper, 0o755);

    const result = runScript(wrapper, work, [], undefined, {
      MERGE_MAIN_SCRIPT: script,
    });

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('up-to-date');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('current work\n');
    expect(git(work, 'stash', 'list').stdout).toContain('-1');
    expect(git(work, 'stash', 'list').stdout.trim().split('\n')).toHaveLength(1);
  });

  it('does not reuse a retained saved-work identity', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'old work\n');
    expect(git(work, 'stash', 'push', '--quiet').status).toBe(0);
    const oldStash = git(work, 'rev-parse', 'refs/stash').stdout.trim();
    expect(git(work, 'stash', 'drop', '--quiet').status).toBe(0);
    writeFile(work, 'a.md', 'current work\n');
    const wrapperDir = makeDir('skills-saved-ref-collision-');
    const wrapper = path.join(wrapperDir, 'run.sh');
    writeFile(
      wrapperDir,
      'run.sh',
      [
        '#!/usr/bin/env sh',
        'target=$(git rev-parse origin/main)',
        'git_dir=$(git rev-parse --path-format=absolute --git-dir)',
        'worktree_id=$(printf "%s\\n" "$git_dir" | git hash-object --stdin)',
        'git update-ref \\',
        '  "refs/remdo-merge-main/saved-$target-$worktree_id" "$OLD_STASH"',
        'exec sh "$MERGE_MAIN_SCRIPT" start --preserve',
        '',
      ].join('\n'),
    );
    fs.chmodSync(wrapper, 0o755);

    const result = runScript(wrapper, work, [], undefined, {
      MERGE_MAIN_SCRIPT: script,
      OLD_STASH: oldStash,
    });

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('up-to-date');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('current work\n');
    expect(
      git(work, 'for-each-ref', '--format=%(objectname)', 'refs/remdo-merge-main')
        .stdout.trim(),
    ).toBe(oldStash);
  });

  it('keeps preserved work separate from another worktree stash', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    const sibling = makeDir('skills-sibling-worktree-');
    expect(
      git(work, 'worktree', 'add', '--quiet', '-b', 'sibling', sibling).status,
    ).toBe(0);
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-concurrent-stash-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = stash ] && [ "$2" = push ]; then',
        '  PATH=${PATH#*:}',
        '  export PATH',
        '  git "$@"',
        '  status=$?',
        '  if [ "$status" -eq 0 ]; then',
        '    printf "sibling work\\n" >"$SIBLING_WORKTREE/a.md"',
        '    (cd "$SIBLING_WORKTREE" && git stash push --quiet)',
        '  fi',
        '  exit "$status"',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const result = runScript(
      script,
      work,
      ['start', '--preserve'],
      bin,
      { SIBLING_WORKTREE: sibling },
    );

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('up-to-date');
    expect(git(work, 'diff', '--name-only').stdout.trim()).toBe('a.md');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('saved work\n');
    expect(git(work, 'stash', 'list').stdout.trim().split('\n')).toHaveLength(1);
    expect(
      git(work, 'for-each-ref', 'refs/remdo-merge-main').stdout,
    ).toBe('');
  });

  it('preserves work when its gitignore change hides existing files', () => {
    const { work } = makeScratchWithOrigin({
      '.gitignore': 'existing/\n',
      'a.md': 'base\n',
    });
    fs.appendFileSync(path.join(work, '.gitignore'), 'newbuild/\n');
    writeFile(work, 'newbuild/output', 'ignored output\n');
    writeFile(work, 'a.md', 'saved work\n');

    const result = run(work, 'start', '--preserve');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('up-to-date');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('saved work\n');
    expect(fs.readFileSync(path.join(work, 'newbuild/output'), 'utf8')).toBe(
      'ignored output\n',
    );
    expect(fs.readFileSync(path.join(work, '.gitignore'), 'utf8')).toBe(
      'existing/\nnewbuild/\n',
    );
  });

  it('continues a determined merge resolution into verification', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });

    const started = run(work, 'start');
    expect(value(started.stdout, 'STATE')).toBe('conflicted');
    expect(started.stdout.startsWith('STATE=conflicted\n')).toBe(true);

    writeFile(work, 'a.md', 'resolved\n');
    expect(git(work, 'add', 'a.md').status).toBe(0);
    const continued = run(work, 'continue');

    expect(continued.status).toBe(0);
    expect(value(continued.stdout, 'STATE')).toBe('verification-needed');
    expect(
      git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').stdout.trim().split(' '),
    ).toHaveLength(3);
    expect(value(run(work, 'finish').stdout, 'STATE')).toBe('merged');
  });

  it('can stop a runner-owned merge with unresolved paths', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });
    expect(value(run(work, 'start').stdout, 'STATE')).toBe('conflicted');

    const stopped = run(work, 'stop');

    expect(value(stopped.stdout, 'STATE')).toBe('stopped');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('local\n');
  });

  it('reports a merge-resolution commit failure', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });
    expect(value(run(work, 'start').stdout, 'STATE')).toBe('conflicted');
    writeFile(work, 'a.md', 'resolved\n');
    expect(git(work, 'add', 'a.md').status).toBe(0);
    const bin = makeDir('skills-commit-failure-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = commit ]; then exit 91; fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const continued = runScript(script, work, ['continue'], bin);

    expect(continued.status).not.toBe(0);
    expect(continued.stderr).toContain('merge-resolution commit failed');
    expect(value(continued.stdout, 'STATE')).toBe('merge-ready');
    expect(value(run(work, 'status').stdout, 'STATE')).toBe('merge-ready');
    expect(value(run(work, 'stop').stdout, 'STATE')).toBe('stopped');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('reports a clean merge whose commit hook rejects it separately', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    const hook = git(
      work,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'hooks/pre-merge-commit',
    ).stdout.trim();
    fs.writeFileSync(hook, '#!/usr/bin/env sh\nexit 1\n');
    fs.chmodSync(hook, 0o755);

    const started = run(work, 'start');

    expect(started.status).toBe(0);
    expect(value(started.stdout, 'STATE')).toBe('merge-commit-failed');
    expect(git(work, 'diff', '--name-only', '--diff-filter=U').stdout).toBe('');
    expect(value(run(work, 'stop').stdout, 'STATE')).toBe('stopped');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('restores preserved work after a rejected merge is externally aborted', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    writeFile(work, 'precious.md', 'saved work\n');
    const hook = git(
      work,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'hooks/pre-merge-commit',
    ).stdout.trim();
    fs.writeFileSync(hook, '#!/usr/bin/env sh\nexit 1\n');
    fs.chmodSync(hook, 0o755);

    const started = run(work, 'start', '--preserve');

    expect(value(started.stdout, 'STATE')).toBe('merge-commit-failed');
    expect(git(work, 'merge', '--abort').status).toBe(0);
    const stopped = run(work, 'stop');
    expect(stopped.status).toBe(0);
    expect(value(stopped.stdout, 'STATE')).toBe('stopped');
    expect(fs.readFileSync(path.join(work, 'precious.md'), 'utf8')).toBe(
      'saved work\n',
    );
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('finds untracked merge-resolution files from a subdirectory', () => {
    const { work, origin } = makeScratchWithOrigin({
      'a.md': 'base\n',
      'nested/tracked.md': 'tracked\n',
    });
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });
    expect(value(run(work, 'start').stdout, 'STATE')).toBe('conflicted');
    writeFile(work, 'a.md', 'resolved\n');
    expect(git(work, 'add', 'a.md').status).toBe(0);
    writeFile(work, 'resolution-note.md', 'untracked\n');

    const continued = run(path.join(work, 'nested'), 'continue');

    expect(continued.status).not.toBe(0);
    expect(continued.stderr).toContain(
      'untracked merge-resolution files remain',
    );
    expect(value(run(work, 'status').stdout, 'STATE')).toBe('merge-ready');
  });

  it('refuses to commit another merge during conflict continuation', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    expect(git(work, 'switch', '--quiet', '-c', 'other').status).toBe(0);
    writeFile(work, 'other.md', 'other\n');
    commitAll(work, 'other');
    const other = git(work, 'rev-parse', 'HEAD').stdout.trim();
    expect(git(work, 'switch', '--quiet', 'main').status).toBe(0);
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });
    expect(value(run(work, 'start').stdout, 'STATE')).toBe('conflicted');
    expect(git(work, 'merge', '--abort').status).toBe(0);
    expect(
      git(work, 'merge', '--quiet', '--no-commit', '--no-ff', 'other').status,
    ).toBe(0);

    const continued = run(work, 'continue');

    expect(continued.status).not.toBe(0);
    expect(continued.stderr).toContain(
      'merge operation does not belong to this run',
    );
    expect(git(work, 'rev-parse', 'MERGE_HEAD').stdout.trim()).toBe(other);
  });

  it('creates a divergent merge commit despite configured merge options', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(git(work, 'branch', '-m', 'feature=x').status).toBe(0);
    expect(git(work, 'config', 'merge.ff', 'only').status).toBe(0);
    expect(
      git(
        work,
        'config',
        'branch.feature=x.mergeOptions',
        '--no-commit --squash',
      ).status,
    ).toBe(0);

    const result = run(work, 'start');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('verification-needed');
    expect(
      git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').stdout.trim().split(' '),
    ).toHaveLength(3);
  });

  it('retains saved work until a restoration conflict is completed', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local dirty\n');
    pushChange(origin, { 'a.md': 'upstream\n' });

    const started = run(work, 'start', '--preserve');

    expect(started.status).toBe(0);
    expect(value(started.stdout, 'STATE')).toBe('restore-conflicted');
    const saved = value(started.stdout, 'STASH')!;
    expect(git(work, 'stash', 'list').stdout).toBe('');
    expect(
      git(work, 'for-each-ref', '--format=%(objectname)', 'refs/remdo-merge-main')
        .stdout,
    ).toContain(saved);

    writeFile(work, 'a.md', 'resolved dirty\n');
    expect(git(work, 'add', 'a.md').status).toBe(0);
    expect(git(work, 'reset', '--quiet', '--', 'a.md').status).toBe(0);
    const completed = run(work, 'complete-restore', '--resolved');

    expect(completed.status).toBe(0);
    expect(value(completed.stdout, 'STATE')).toBe('fast-forwarded');
    expect(value(completed.stdout, 'STASH')).toBeTruthy();
    expect(value(completed.stdout, 'SAVED_REF')).toBeTruthy();
    expect(git(work, 'stash', 'list').stdout).toBe('');
    expect(
      git(work, 'for-each-ref', '--format=%(objectname)', 'refs/remdo-merge-main')
        .stdout,
    ).toContain(saved);
    expect(git(work, 'diff', '--name-only').stdout.trim()).toBe('a.md');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('finishes restoration when the saved-work ref was replaced', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'local.md', 'local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    writeFile(work, 'dirty.md', 'saved work\n');

    const started = run(work, 'start', '--preserve');

    expect(value(started.stdout, 'STATE')).toBe('verification-needed');
    const savedRef = value(started.stdout, 'SAVED_REF')!;
    const stash = value(started.stdout, 'STASH')!;
    const replacement = git(work, 'rev-parse', 'HEAD').stdout.trim();
    expect(git(work, 'update-ref', savedRef, replacement, stash).status).toBe(0);

    const finished = run(work, 'finish');

    expect(finished.status).toBe(0);
    expect(value(finished.stdout, 'STATE')).toBe('merged');
    expect(finished.stderr).toContain('retained saved-work ref');
    expect(fs.readFileSync(path.join(work, 'dirty.md'), 'utf8')).toBe(
      'saved work\n',
    );
    expect(git(work, 'rev-parse', savedRef).stdout.trim()).toBe(replacement);
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('does not drop saved work from an ambiguous restoration phase', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local dirty\n');
    pushChange(origin, { 'a.md': 'upstream\n' });
    const started = run(work, 'start', '--preserve');
    expect(value(started.stdout, 'STATE')).toBe('restore-conflicted');
    const saved = value(started.stdout, 'STASH')!;
    writeFile(stateDir(work), 'phase', 'restore-pending\n');

    expect(value(run(work, 'status').stdout, 'STATE')).toBe('restore-pending');
    const completed = run(work, 'complete-restore');
    expect(completed.status).not.toBe(0);
    expect(value(run(work, 'continue').stdout, 'STATE')).toBe(
      'restore-conflicted',
    );
    expect(
      git(work, 'for-each-ref', '--format=%(objectname)', 'refs/remdo-merge-main')
        .stdout,
    ).toContain(saved);
  });

  it('requires resolved untracked restoration conflicts to be acknowledged', () => {
    const { work, origin } = makeScratchWithOrigin({
      'a.md': 'base\n',
      'nested/tracked.md': 'tracked\n',
    });
    pushChange(origin, { 'nested/new.md': 'upstream\n' });
    writeFile(work, 'nested/new.md', 'saved work\n');

    const started = run(path.join(work, 'nested'), 'start', '--preserve');

    expect(started.status).toBe(0);
    expect(value(started.stdout, 'STATE')).toBe('restore-conflicted');
    expect(value(started.stdout, 'UNTRACKED_CONFLICT')).toBe('nested/new.md');
    expect(fs.readFileSync(path.join(work, 'nested/new.md'), 'utf8')).toBe(
      'upstream\n',
    );
    expect(git(work, 'diff', '--name-only', '--diff-filter=U').stdout).toBe('');
    const premature = run(work, 'complete-restore');
    expect(premature.status).not.toBe(0);
    expect(premature.stderr).toContain('requires --resolved');
    expect(value(run(work, 'status').stdout, 'STATE')).toBe(
      'restore-conflicted',
    );

    writeFile(work, 'nested/new.md', 'saved work\n');
    const completed = run(work, 'complete-restore', '--resolved');
    expect(completed.status).toBe(0);
    expect(value(completed.stdout, 'STATE')).toBe('fast-forwarded');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('stops restoration after integration is lost', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    pushChange(origin, { 'new.md': 'upstream\n' });
    writeFile(work, 'new.md', 'saved work\n');
    const started = run(work, 'start', '--preserve');
    expect(value(started.stdout, 'STATE')).toBe('restore-conflicted');
    const startHead = fs.readFileSync(
      path.join(stateDir(work), 'start-head'),
      'utf8',
    ).trim();
    expect(git(work, 'reset', '--hard', '--quiet', startHead).status).toBe(0);

    const completed = run(work, 'complete-restore', '--resolved');

    expect(completed.status).toBe(0);
    expect(value(completed.stdout, 'STATE')).toBe('stopped');
    expect(value(completed.stdout, 'SAVED_REF')).toBeTruthy();
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('finishes restore-applied cleanup after interruption', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-restore-applied-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = update-ref ] && [ "$2" = -d ]; then',
        '  case "$3" in',
        '    refs/remdo-merge-main/saved-*) kill -KILL "$PPID"; exit 91 ;;',
        '  esac',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    expect(
      runScript(script, work, ['start', '--preserve'], bin).status,
    ).not.toBe(0);
    expect(value(run(work, 'status').stdout, 'STATE')).toBe('restore-ready');
    const completed = run(work, 'complete-restore');
    const savedRef = value(completed.stdout, 'SAVED_REF')!;

    expect(value(completed.stdout, 'STATE')).toBe('up-to-date');
    expect(git(work, 'rev-parse', savedRef).status).not.toBe(0);
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('reports an interrupted successful restoration as uncertain', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-restore-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = stash ] && [ "$2" = apply ]; then',
        '  PATH=${PATH#*:}',
        '  export PATH',
        '  git "$@"',
        '  status=$?',
        '  [ "$status" -ne 0 ] || kill -KILL "$PPID"',
        '  exit "$status"',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const interrupted = runScript(
      script,
      work,
      ['start', '--preserve'],
      bin,
    );

    expect(interrupted.status).not.toBe(0);
    expect(value(run(work, 'status').stdout, 'STATE')).toBe('restore-pending');
    expect(value(run(work, 'continue').stdout, 'STATE')).toBe(
      'restore-uncertain',
    );
    const completed = run(work, 'complete-restore', '--resolved');
    expect(value(completed.stdout, 'STATE')).toBe('up-to-date');
    expect(value(completed.stdout, 'STASH')).toBeTruthy();
  });

  it('stops an interrupted restoration after integration is lost', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'local.md', 'local\n');
    commitAll(work, 'local');
    const startHead = git(work, 'rev-parse', 'HEAD').stdout.trim();
    advanceOrigin(origin);
    writeFile(work, 'dirty.md', 'saved work\n');
    expect(value(run(work, 'start', '--preserve').stdout, 'STATE')).toBe(
      'verification-needed',
    );
    const bin = makeDir('skills-restore-pending-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = stash ] && [ "$2" = apply ]; then',
        '  kill -KILL "$PPID"',
        '  exit 91',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);
    expect(runScript(script, work, ['finish'], bin).status).not.toBe(0);
    expect(git(work, 'reset', '--hard', '--quiet', startHead).status).toBe(0);
    expect(runScript(script, work, ['continue'], bin).status).not.toBe(0);

    const continued = run(work, 'continue');

    expect(value(continued.stdout, 'STATE')).toBe('stopped');
    const savedRef = value(continued.stdout, 'SAVED_REF')!;
    expect(fs.readFileSync(path.join(work, 'dirty.md'), 'utf8')).toBe(
      'saved work\n',
    );
    expect(git(work, 'rev-parse', savedRef).status).toBe(0);
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('retains a stopped result through restoration conflict completion', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    advanceOrigin(origin);
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-git-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'is_merge=no',
        'for argument do',
        '  [ "$argument" != merge ] || is_merge=yes',
        'done',
        'if [ "$is_merge" = yes ]; then',
        '  printf "merge failure\\n" >a.md',
        '  exit 1',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const started = runScript(
      script,
      work,
      ['start', '--preserve'],
      bin,
    );

    expect(started.status).not.toBe(0);
    expect(value(started.stdout, 'STATE')).toBe('restore-conflicted');
    writeFile(work, 'a.md', 'resolved work\n');
    const completed = run(work, 'complete-restore', '--resolved');
    expect(value(completed.stdout, 'STATE')).toBe('stopped');
  });

  it('restores preserved work after external history stops a run', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'local.md', 'local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    writeFile(work, 'dirty.md', 'saved work\n');
    const started = run(work, 'start', '--preserve');
    expect(value(started.stdout, 'STATE')).toBe('verification-needed');
    const startHead = fs.readFileSync(
      path.join(stateDir(work), 'start-head'),
      'utf8',
    ).trim();
    expect(
      git(work, 'reset', '--hard', '--quiet', `${startHead}^`),
    ).toHaveProperty('status', 0);
    expect(value(run(work, 'status').stdout, 'STATE')).toBe('stopped');

    const stopped = run(work, 'stop');

    expect(stopped.status).toBe(0);
    expect(value(stopped.stdout, 'STATE')).toBe('stopped');
    expect(fs.readFileSync(path.join(work, 'dirty.md'), 'utf8')).toBe(
      'saved work\n',
    );
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
    expect(
      git(work, 'for-each-ref', 'refs/remdo-merge-main').stdout,
    ).toBe('');
  });

  it('reports preserved state after the destination branch is renamed', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'local.md', 'local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    writeFile(work, 'dirty.md', 'saved work\n');
    expect(value(run(work, 'start', '--preserve').stdout, 'STATE')).toBe(
      'verification-needed',
    );
    expect(git(work, 'branch', '-m', 'renamed').status).toBe(0);

    const status = run(work, 'status');

    expect(status.status).toBe(0);
    expect(value(status.stdout, 'STATE')).toBe('branch-mismatch');
    expect(value(status.stdout, 'BRANCH')).toBe('main');
    expect(value(status.stdout, 'PRESERVED')).toBe('yes');
    expect(value(status.stdout, 'STASH')).toBeTruthy();
  });

  it('refuses a detached merge destination', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    expect(git(work, 'checkout', '--quiet', '--detach').status).toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('detached HEAD');
  });

  it('refuses unrelated histories', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const replacement = makeDir('skills-unrelated-');
    expect(
      git(replacement, 'init', '--quiet', '--initial-branch=main').status,
    ).toBe(0);
    writeFile(replacement, 'unrelated.md', '# unrelated\n');
    commitAll(replacement, 'unrelated root');
    expect(git(replacement, 'remote', 'add', 'origin', origin).status).toBe(0);
    expect(
      git(replacement, 'push', '--quiet', '--force', 'origin', 'main').status,
    ).toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unrelated histories');
  });

  it('refuses another Git operation in progress', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    expect(git(work, 'switch', '--quiet', '-c', 'other').status).toBe(0);
    writeFile(work, 'a.md', 'other\n');
    commitAll(work, 'other');
    expect(git(work, 'switch', '--quiet', 'main').status).toBe(0);
    writeFile(work, 'a.md', 'main\n');
    commitAll(work, 'main');
    expect(git(work, 'merge', '--quiet', 'other').status).not.toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('another Git operation');
  });

  it('refuses unresolved paths without a recorded Git operation', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    expect(git(work, 'switch', '--quiet', '-c', 'other').status).toBe(0);
    writeFile(work, 'a.md', 'other\n');
    commitAll(work, 'other');
    expect(git(work, 'switch', '--quiet', 'main').status).toBe(0);
    writeFile(work, 'a.md', 'main\n');
    commitAll(work, 'main');
    expect(git(work, 'merge', '--quiet', 'other').status).not.toBe(0);
    const mergeHead = git(work, 'rev-parse', '--git-path', 'MERGE_HEAD')
      .stdout.trim();
    fs.rmSync(path.join(work, mergeHead));

    const result = run(work, 'start', '--preserve');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unresolved paths');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('refuses a missing origin and a non-repository', () => {
    expect(run(makeBareMain({ 'a.md': '# A\n' }), 'start').status).not.toBe(0);
    const nonRepo = run(makeNonRepoDir(), 'start');
    expect(nonRepo.status).not.toBe(0);
    expect(nonRepo.stderr).toContain('not a git repository');
  });

  it('refuses a deleted remote main instead of using a stale tracking ref', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const before = git(work, 'rev-parse', 'HEAD').stdout;
    expect(git(origin, 'update-ref', '-d', 'refs/heads/main').status).toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(before);
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });
});
