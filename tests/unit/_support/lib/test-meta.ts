import type { TaskMeta, TestOptions } from 'vitest';

export const meta = (
  meta: TaskMeta,
  options: TestOptions = {}
): TestOptions & { meta: TaskMeta } => ({
  ...options,
  meta,
});
