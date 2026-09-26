import { getHeapStatistics } from 'node:v8';

const BASELINE_HEAP_MB = 32;
// A 2000-note (300 KB) document measured ~9 MB of MCP heap while open.
const DOCUMENT_HEAP_MB = 16;
const SLOT_WAIT_MS = 30_000;

/** How many documents fit in this process's heap limit at once. */
export function documentSlotsForHeap(heapLimitBytes = getHeapStatistics().heap_size_limit): number {
  return Math.max(1, Math.floor((heapLimitBytes / 2 ** 20 - BASELINE_HEAP_MB) / DOCUMENT_HEAP_MB));
}

/**
 * Run document work with at most `slots` documents open at once. Work that
 * cannot start within the wait fails instead of queueing without bound.
 */
export function createDocumentSlots(slots: number, waitMs = SLOT_WAIT_MS) {
  let open = 0;
  const waiting: Array<() => void> = [];

  function release() {
    const next = waiting.shift();
    if (next) next();
    else open--;
  }

  function acquire(): Promise<void> {
    if (open < slots) {
      open++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const start = () => {
        clearTimeout(timer);
        resolve();
      };
      timer = setTimeout(() => {
        waiting.splice(waiting.indexOf(start), 1);
        reject(new Error('RemDo is busy; try again shortly.'));
      }, waitMs);
      waiting.push(start);
    });
  }

  return async <T>(run: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await run();
    } finally {
      release();
    }
  };
}
