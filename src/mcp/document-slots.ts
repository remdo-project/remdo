const DOCUMENT_OPEN_TIMEOUT_MS = 30_000;

/**
 * Run document work with at most `slots` documents open at once. Work that
 * cannot open within the deadline fails, including time spent waiting for a slot.
 * The callback passes its signal to document acquisition, not subsequent work.
 */
export function createDocumentSlots(slots: number, timeoutMs = DOCUMENT_OPEN_TIMEOUT_MS) {
  let open = 0;
  const waiting: Array<() => void> = [];

  function release() {
    const next = waiting.shift();
    if (next) next();
    else open--;
  }

  function acquire(signal: AbortSignal): Promise<void> {
    if (open < slots) {
      open++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      function start() {
        signal.removeEventListener('abort', cancel);
        resolve();
      }
      function cancel() {
        waiting.splice(waiting.indexOf(start), 1);
        reject(signal.reason);
      }
      signal.addEventListener('abort', cancel, { once: true });
      waiting.push(start);
    });
  }

  return async <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('RemDo is busy; try again shortly.')), timeoutMs);
    try {
      await acquire(controller.signal);
      try {
        return await run(controller.signal);
      } finally {
        release();
      }
    } finally {
      clearTimeout(timer);
    }
  };
}
