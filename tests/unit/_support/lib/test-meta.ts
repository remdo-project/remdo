import type { TestOptions } from 'vitest';

export const meta = (meta: Record<string, unknown>): TestOptions & { meta: Record<string, unknown> } => ({
  meta,
});
