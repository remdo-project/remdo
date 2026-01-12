import type { TestOptions } from 'vitest';

export const meta = (
  meta: Record<string, unknown>,
  options: TestOptions = {}
): TestOptions & { meta: Record<string, unknown> } => ({
  ...options,
  meta,
});
