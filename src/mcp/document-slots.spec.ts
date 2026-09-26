import { afterEach, expect, it, vi } from 'vitest';
import { createDocumentSlots, documentSlotsForHeap } from './document-slots';

afterEach(() => {
  vi.useRealTimers();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

it('sizes slots from the heap limit and keeps at least one', () => {
  expect(documentSlotsForHeap(64 * 2 ** 20)).toBe(2);
  expect(documentSlotsForHeap(448 * 2 ** 20)).toBe(26);
  expect(documentSlotsForHeap(16 * 2 ** 20)).toBe(1);
});

it('starts queued work when a slot frees', async () => {
  const withSlot = createDocumentSlots(1);
  const first = deferred();
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
  const first = deferred();
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
