import { afterEach, expect, it, vi } from 'vitest';
import { createDocumentSlots } from './document-slots';
import { createDeferred } from '../../tests/unit/_support/deferred';

afterEach(() => {
  vi.useRealTimers();
});

it('starts queued work when a slot frees', async () => {
  const withSlot = createDocumentSlots(1);
  const first = createDeferred();
  const order: string[] = [];
  const running = withSlot(async () => { order.push('first'); await first.promise; });
  const queued = withSlot(async () => { order.push('second'); });
  await Promise.resolve();
  expect(order).toEqual(['first']);
  first.resolve();
  await Promise.all([running, queued]);
  expect(order).toEqual(['first', 'second']);
});

it('releases the slot when work fails', async () => {
  const withSlot = createDocumentSlots(1);
  await expect(withSlot(() => Promise.reject(new Error('failed')))).rejects.toThrow('failed');
  await expect(withSlot(() => Promise.resolve('ran'))).resolves.toBe('ran');
});

it('fails work that cannot start within the wait', async () => {
  vi.useFakeTimers();
  const withSlot = createDocumentSlots(1, 1000);
  const first = createDeferred();
  const running = withSlot(() => first.promise);
  const run = vi.fn(() => Promise.resolve());
  const queued = withSlot(run);
  const rejected = expect(queued).rejects.toThrow('RemDo is busy');
  await vi.advanceTimersByTimeAsync(1000);
  await rejected;
  first.resolve();
  await running;
  expect(run).not.toHaveBeenCalled();
  await expect(withSlot(() => Promise.resolve('ran'))).resolves.toBe('ran');
});

it('includes queue time in the deadline for opening a document', async () => {
  vi.useFakeTimers();
  const withSlot = createDocumentSlots(1, 1000);
  const first = createDeferred();
  const running = withSlot(() => first.promise);
  let signal!: AbortSignal;
  const opened = createDeferred();
  const queued = withSlot(async (openingSignal) => {
    signal = openingSignal;
    await opened.promise;
  });
  await vi.advanceTimersByTimeAsync(800);
  first.resolve();
  await running;
  await vi.advanceTimersByTimeAsync(199);
  expect(signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(signal.aborted).toBe(true);
  expect(signal.reason.message).toBe('RemDo is busy; try again shortly.');
  opened.resolve();
  await queued;
  await expect(withSlot(async () => 'ran')).resolves.toBe('ran');
});
