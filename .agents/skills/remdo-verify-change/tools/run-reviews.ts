import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse, stringify } from 'yaml';
import { z } from 'zod';

const argument = z.string().refine(value => !value.includes('\0'), 'NUL is not allowed in process arguments');
const planSchema = z.strictObject({
  output_dir: argument.pipe(z.string().min(1)),
  reviews: z.array(z.strictObject({
    source: z.string().regex(/^[a-z][a-z0-9-]*$/u),
    executable: argument.pipe(z.string().min(1)),
    args: z.array(argument),
    cwd: argument.pipe(z.string().min(1)).optional(),
    session_id: z.string().min(1).optional(),
  })),
}).refine(plan => new Set(plan.reviews.map(review => review.source)).size === plan.reviews.length, {
  message: 'Review sources must be unique',
});

interface ReviewResult {
  source: string;
  session_id?: string;
  pid?: number;
  output_file: string;
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  error?: string;
  error_code?: string;
  cleanup_error?: string;
}

async function main(): Promise<void> {
  if (process.argv.length !== 3) throw new Error('Usage: node run-reviews.ts <plan.yaml>');
  if (process.platform === 'win32') throw new Error('Review process groups require a POSIX host');
  const plan = planSchema.parse(parse(readFileSync(process.argv[2]!, 'utf8')));
  for (const review of plan.reviews) {
    if (review.cwd && !statSync(review.cwd).isDirectory()) {
      throw new Error(`Not a review working directory: ${review.cwd}`);
    }
  }
  const outputDir = path.resolve(plan.output_dir);
  mkdirSync(path.dirname(outputDir), { recursive: true });
  // A new directory keeps every invocation's evidence immutable across reruns.
  mkdirSync(outputDir);
  writeFileSync(path.join(outputDir, 'plan.yaml'), stringify(plan));
  const logs: number[] = [];
  const active = new Map<number, ReviewResult>();
  let interrupted: NodeJS.Signals | undefined;
  let cancellation: NodeJS.Timeout | undefined;
  const signalReview = (pid: number, result: ReviewResult, signal: NodeJS.Signals) => {
    try {
      process.kill(-pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        result.cleanup_error = error instanceof Error ? error.message : String(error);
      }
    }
  };
  const signalActive = (signal: NodeJS.Signals) => {
    for (const [pid, result] of active) signalReview(pid, result, signal);
  };
  const killActive = () => signalActive('SIGKILL');
  const cancel = (signal: NodeJS.Signals) => {
    if (interrupted) return;
    interrupted = signal;
    signalActive(signal);
    cancellation = setTimeout(killActive, 5000);
  };
  const onInterrupt = () => cancel('SIGINT');
  const onTerminate = () => cancel('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  process.on('exit', killActive);

  try {
    // Open every output destination before any reviewer can start.
    for (const review of plan.reviews) {
      logs.push(openSync(path.join(outputDir, `${review.source}.log`), 'wx'));
    }
    const results = await Promise.all(plan.reviews.map((review, index) => new Promise<ReviewResult>((resolve) => {
      const result: ReviewResult = {
        source: review.source,
        session_id: review.session_id,
        output_file: path.join(outputDir, `${review.source}.log`),
        exit_code: null,
        signal: null,
      };
      const fail = (error: NodeJS.ErrnoException) => {
        result.error = error.message;
        result.error_code = error.code;
      };
      const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
        if (result.pid !== undefined) {
          // File-backed stdio does not wait for descendants after their parent exits.
          signalReview(result.pid, result, 'SIGKILL');
          active.delete(result.pid);
        }
        result.exit_code = exitCode;
        result.signal = signal;
        process.stdout.write(`${JSON.stringify({ event: 'review-finished', ...result })}\n`);
        resolve(result);
      };
      try {
        const child = spawn(review.executable, review.args, {
          cwd: review.cwd,
          shell: false,
          detached: true,
          // The shared descriptor preserves stdout/stderr without model output
          // limits or an in-memory transcript. The parent still owns the child.
          stdio: ['ignore', logs[index]!, logs[index]!],
        });
        result.pid = child.pid;
        if (child.pid !== undefined) active.set(child.pid, result);
        child.once('error', fail);
        child.once('close', finish);
      } catch (error) {
        fail(error as NodeJS.ErrnoException);
        finish(null, null);
      }
    })));
    const resultFile = path.join(outputDir, 'results.yaml');
    writeFileSync(resultFile, stringify({ interrupted, reviews: results }));
    process.stdout.write(`${JSON.stringify({ event: 'finished', result_file: resultFile })}\n`);
    process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted ? 143
      : results.some(result => result.error || result.cleanup_error || result.signal || result.exit_code !== 0) ? 1 : 0;
  } finally {
    clearTimeout(cancellation);
    killActive();
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
    process.off('exit', killActive);
    for (const fd of logs) closeSync(fd);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
