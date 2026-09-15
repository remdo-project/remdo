import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred } from './_support/deferred';

const entry = vi.hoisted(() => ({
  createRuntime: vi.fn(),
  serve: vi.fn(),
  exit: vi.fn(),
  on: vi.fn(),
}));

vi.mock('node:process', async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof import('node:process') }>();
  return { ...actual, default: { ...actual.default, on: entry.on, exit: entry.exit } };
});
vi.mock('@hono/node-server', () => ({ serve: entry.serve }));
vi.mock('#server/runtime', () => ({ createServerRuntime: entry.createRuntime }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('production API startup', () => {
  it.each(['SIGINT', 'SIGTERM'])('drains initialization without listening when %s arrives during startup', async (signal) => {
    const ready = createDeferred();
    const closed = createDeferred();
    const close = vi.fn(() => closed.promise);
    entry.createRuntime.mockImplementationOnce(async () => {
      await ready.promise;
      return { app: { fetch }, close };
    });
    await import('../../tools/remdo-api-server');

    const stop = entry.on.mock.calls.find(([event]) => event === signal)![1] as () => void;
    stop();
    expect(entry.serve).not.toHaveBeenCalled();
    expect(entry.exit).not.toHaveBeenCalled();
    ready.resolve();
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(close).toHaveBeenCalledOnce();
    expect(entry.serve).not.toHaveBeenCalled();
    expect(entry.exit).not.toHaveBeenCalled();
    closed.resolve();
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(entry.exit).toHaveBeenCalledExactlyOnceWith(0);
  });
});
