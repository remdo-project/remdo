export const VITEST_DEFAULT_TEST_TIMEOUT_MS = 5000;
// For specs whose tests spawn pnpm/tsx subprocesses: the cold start alone is
// 1-2s per spawn and multiplies under full-suite fork contention, so the
// default budget flakes on loaded machines.
export const SUBPROCESS_TEST_TIMEOUT_MS = 15_000;
export const TESTING_LIBRARY_ASYNC_TIMEOUT_MS = Math.floor(
  VITEST_DEFAULT_TEST_TIMEOUT_MS * 0.4,
);
