import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { parse, stringify } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTempDirs, makeDir } from '../../_shared/test-support/git-scratch';

const runner = path.resolve('.agents/skills/remdo-verify-change/tools/run-reviews.ts');
const running: ChildProcess[] = [];
const cleanups: Array<() => void> = [];

function start(plan: string): ChildProcess {
  const child = spawn(process.execPath, [runner, plan], { stdio: ['ignore', 'pipe', 'pipe'] });
  running.push(child);
  return child;
}

function planFile(dir: string, reviews: unknown[]): string {
  const file = path.join(dir, 'plan.yaml');
  fs.writeFileSync(file, stringify({ output_dir: path.join(dir, 'output'), reviews }));
  return file;
}

function waitForFile(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let watcher: fs.FSWatcher;
    const check = () => {
      if (fs.existsSync(file)) { watcher.close(); resolve(); }
    };
    watcher = fs.watch(path.dirname(file), check);
    watcher.once('error', reject);
    cleanups.push(() => watcher.close());
    check();
  });
}

function trackDescendant(pidFile: string): () => void {
  let stopped = false;
  cleanups.push(() => {
    if (stopped || !fs.existsSync(pidFile)) return;
    try {
      process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  });
  return () => { stopped = true; };
}

afterEach(async () => {
  try {
    await Promise.all(running.splice(0).map(async (child) => {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = once(child, 'close');
        child.kill('SIGTERM');
        await closed;
      }
    }));
  } finally {
    for (const cleanup of cleanups.splice(0)) cleanup();
    cleanupTempDirs();
  }
}, 15000);

describe('review runner', () => {
  it('honors working directories, preserves arguments and logs, and isolates concurrent failures', async () => {
    const dir = makeDir('review-runner-');
    const literal = 'spaces "quotes" $(touch SHOULD_NOT_EXIST) `echo nope`\nnext line';
    const fixture = path.join(dir, 'review.mjs');
    fs.writeFileSync(fixture, `
      import fs from 'node:fs';
      import path from 'node:path';
      const [dir, role, literal] = process.argv.slice(2);
      const check = () => {
        if (!fs.existsSync(path.join(dir, 'failed.ready')) ||
            !fs.existsSync(path.join(dir, 'successful.ready'))) return;
        if (role === 'successful' && !fs.existsSync(path.join(dir, 'release'))) return;
        watcher.close();
        fs.writeSync(1, process.cwd() + '\\n' + literal + '\\n' + 'x'.repeat(200000));
        fs.writeSync(2, '\\nstderr evidence');
        process.exit(role === 'failed' ? 7 : 0);
      };
      const watcher = fs.watch(dir, check);
      fs.writeFileSync(path.join(dir, role + '.ready'), '');
      check();
    `);
    const plan = planFile(dir, [
      ...['failed', 'successful'].map(source => ({
        source, executable: process.execPath, args: [fixture, dir, source, literal],
        cwd: dir, session_id: `session-${source}`,
      })),
      { source: 'missing', executable: path.join(dir, 'no-such-executable'), args: [] },
    ]);
    const child = start(plan);
    const closed = once(child, 'close');
    const notices: Array<{ event: string; source?: string }> = [];
    createInterface({ input: child.stdout! }).on('line', (line) => {
      const notice = JSON.parse(line);
      notices.push(notice);
      // The successful reviewer stays alive until its peer's failure is
      // recorded, proving a failed review does not cancel remaining work.
      if (notice.source === 'failed') fs.writeFileSync(path.join(dir, 'release'), '');
    });
    expect(await closed).toEqual([1, null]);
    const results = parse(fs.readFileSync(path.join(dir, 'output/results.yaml'), 'utf8'));
    expect(results.reviews).toMatchObject([
      { source: 'failed', exit_code: 7, session_id: 'session-failed' },
      { source: 'successful', exit_code: 0, session_id: 'session-successful' },
      { source: 'missing', error_code: 'ENOENT' },
    ]);
    expect(fs.readFileSync(path.join(dir, 'output/successful.log'), 'utf8'))
      .toBe(`${dir}\n${literal}\n${'x'.repeat(200000)}\nstderr evidence`);
    expect(fs.existsSync(path.join(dir, 'SHOULD_NOT_EXIST'))).toBe(false);
    expect(JSON.stringify(notices)).not.toContain(literal);
    expect(notices).toHaveLength(4);
    expect(notices.at(-1)).toMatchObject({ event: 'finished' });
  });

  it('succeeds with valid commands and refuses to overwrite an earlier run', () => {
    const dir = makeDir('review-runner-');
    const plan = planFile(dir, [{
      source: 'review', executable: process.execPath, args: ['-e', "console.log('complete')"],
    }]);
    expect(spawnSync(process.execPath, [runner, plan]).status).toBe(0);
    const before = fs.readFileSync(path.join(dir, 'output/results.yaml'), 'utf8');
    expect(spawnSync(process.execPath, [runner, plan]).status).toBe(1);
    expect(fs.readFileSync(path.join(dir, 'output/results.yaml'), 'utf8')).toBe(before);
  });

  it('records a synchronous launch failure without interrupting a healthy reviewer', async () => {
    const dir = makeDir('review-runner-');
    const fixture = path.join(dir, 'healthy.mjs');
    fs.writeFileSync(fixture, `
      import fs from 'node:fs';
      import path from 'node:path';
      const dir = process.argv[2];
      const check = () => {
        if (!fs.existsSync(path.join(dir, 'release'))) return;
        watcher.close();
        fs.writeSync(1, 'healthy review completed');
        process.exit(0);
      };
      const watcher = fs.watch(dir, check);
      check();
    `);
    const child = start(planFile(dir, [
      { source: 'healthy', executable: process.execPath, args: [fixture, dir] },
      { source: 'too-large', executable: process.execPath, args: ['-e', '', 'x'.repeat(1024 * 1024)] },
    ]));
    const closed = once(child, 'close');
    createInterface({ input: child.stdout! }).on('line', (line) => {
      if (JSON.parse(line).source === 'too-large') fs.writeFileSync(path.join(dir, 'release'), '');
    });
    expect(await closed).toEqual([1, null]);
    expect(parse(fs.readFileSync(path.join(dir, 'output/results.yaml'), 'utf8')).reviews).toMatchObject([
      { source: 'healthy', exit_code: 0, signal: null },
      { source: 'too-large', error_code: 'E2BIG' },
    ]);
    expect(fs.readFileSync(path.join(dir, 'output/healthy.log'), 'utf8')).toBe('healthy review completed');
  });

  it('succeeds with an empty review list and records an empty result', () => {
    const dir = makeDir('review-runner-');
    expect(spawnSync(process.execPath, [runner, planFile(dir, [])]).status).toBe(0);
    expect(parse(fs.readFileSync(path.join(dir, 'output/results.yaml'), 'utf8'))).toEqual({ reviews: [] });
  });

  it.each([0, 2])('stops a surviving descendant when its wrapper exits with %i', async (wrapperExit) => {
    const dir = makeDir('review-runner-');
    const socketPath = path.join(dir, 'descendant.sock');
    const pidFile = path.join(dir, 'descendant.pid');
    const markStopped = trackDescendant(pidFile);
    const server = createServer();
    cleanups.push(() => { server.close(); });
    const listening = once(server, 'listening');
    server.listen(socketPath);
    await listening;
    const accepted = once(server, 'connection');
    const fixture = path.join(dir, 'wrapper.mjs');
    fs.writeFileSync(fixture, `
      import fs from 'node:fs';
      import path from 'node:path';
      import { spawn } from 'node:child_process';
      import { connect } from 'node:net';
      const [dir, role, wrapperExit] = process.argv.slice(2);
      if (role === 'wrapper') {
        const child = spawn(process.execPath, [process.argv[1], dir, 'descendant'], { stdio: 'inherit' });
        fs.writeFileSync(path.join(dir, 'descendant.pid'), String(child.pid));
        const check = () => {
          if (fs.existsSync(path.join(dir, 'release-wrapper'))) process.exit(Number(wrapperExit));
        };
        fs.watch(dir, check);
        check();
      } else {
        const socket = connect(path.join(dir, 'descendant.sock'));
        socket.on('data', () => {
          fs.writeSync(1, 'AFTER_COMPLETION');
          socket.write('still running');
        });
      }
    `);
    const child = start(planFile(dir, [{
      source: 'wrapper', executable: process.execPath, args: [fixture, dir, 'wrapper', String(wrapperExit)],
    }]));
    const closed = once(child, 'close');
    const [socket] = await accepted as [Socket];
    cleanups.push(() => { socket.destroy(); });
    socket.once('close', markStopped);
    const descendantOutcome = new Promise<'closed' | 'responded'>((resolve, reject) => {
      socket.once('close', () => resolve('closed'));
      socket.once('data', () => resolve('responded'));
      socket.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ECONNRESET' && error.code !== 'EPIPE') reject(error);
      });
    });
    createInterface({ input: child.stdout! }).on('line', (line) => {
      if (JSON.parse(line).source === 'wrapper' && !socket.destroyed) socket.write('probe');
    });
    fs.writeFileSync(path.join(dir, 'release-wrapper'), '');
    expect(await descendantOutcome).toBe('closed');
    expect(await closed).toEqual([wrapperExit === 0 ? 0 : 1, null]);
    expect(parse(fs.readFileSync(path.join(dir, 'output/results.yaml'), 'utf8')).reviews).toMatchObject([
      { source: 'wrapper', exit_code: wrapperExit, signal: null },
    ]);
    expect(fs.readFileSync(path.join(dir, 'output/wrapper.log'), 'utf8')).toBe('');
  });

  it.each(['duplicate', 'nul', 'source', 'permissions'])('rejects %s input before launching any command', (kind) => {
    const dir = makeDir('review-runner-');
    const marker = path.join(dir, 'launched');
    const review = {
      source: 'review', executable: process.execPath,
      args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '')`],
    };
    const reviews = kind === 'duplicate' ? [review, review]
      : kind === 'nul' ? [review, { ...review, source: 'invalid', args: ['\0'] }]
        : kind === 'source' ? [review, { ...review, source: '../escape' }]
          : [{ ...review, sandbox_permissions: 'require_escalated' }];
    expect(spawnSync(process.execPath, [runner, planFile(dir, reviews)]).status).toBe(1);
    expect(fs.existsSync(marker)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'output'))).toBe(false);
  });

  it('forwards cancellation to reviewer descendants and retains interrupted results', async () => {
    const dir = makeDir('review-runner-');
    trackDescendant(path.join(dir, 'descendant.pid'));
    const fixture = path.join(dir, 'tree.mjs');
    fs.writeFileSync(fixture, `
      import fs from 'node:fs';
      import path from 'node:path';
      import { spawn } from 'node:child_process';
      const [dir, role] = process.argv.slice(2);
      if (role === 'parent') {
        const child = spawn(process.execPath, [process.argv[1], dir, 'descendant'], { stdio: 'inherit' });
        fs.writeFileSync(path.join(dir, 'descendant.pid'), String(child.pid));
        process.on('SIGINT', () => fs.writeFileSync(path.join(dir, 'parent-stopped'), ''));
        child.on('close', () => process.exit(0));
      } else {
        process.on('SIGINT', () => {
          fs.writeFileSync(path.join(dir, 'descendant-stopped'), '');
          process.exit(0);
        });
        fs.writeFileSync(path.join(dir, 'ready'), '');
        setInterval(() => {}, 1000);
      }
    `);
    const ready = waitForFile(path.join(dir, 'ready'));
    const child = start(planFile(dir, [{ source: 'tree', executable: process.execPath, args: [fixture, dir, 'parent'] }]));
    const closed = once(child, 'close');
    await ready;
    child.kill('SIGINT');
    expect(await closed).toEqual([130, null]);
    expect(fs.existsSync(path.join(dir, 'parent-stopped'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'descendant-stopped'))).toBe(true);
    expect(parse(fs.readFileSync(path.join(dir, 'output/results.yaml'), 'utf8')).interrupted).toBe('SIGINT');
  }, 15000);

  it('terminates an unresponsive reviewer after the cancellation grace period', async () => {
    const dir = makeDir('review-runner-');
    const marker = path.join(dir, 'ready');
    const ready = waitForFile(marker);
    const child = start(planFile(dir, [{
      source: 'unresponsive', executable: process.execPath,
      args: ['-e', `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(marker)}, ''); setInterval(() => {}, 1000);`],
    }]));
    const closed = once(child, 'close');
    await ready;
    child.kill('SIGTERM');
    expect(await closed).toEqual([143, null]);
    expect(parse(fs.readFileSync(path.join(dir, 'output/results.yaml'), 'utf8'))).toMatchObject({
      interrupted: 'SIGTERM', reviews: [{ source: 'unresponsive', exit_code: null, signal: 'SIGKILL' }],
    });
  }, 15000);
});
