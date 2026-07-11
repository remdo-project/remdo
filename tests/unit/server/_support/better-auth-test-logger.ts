import type { BetterAuthOptions } from 'better-auth';

export const guardedBetterAuthLogger = {
  level: 'error',
  log(level, message, ...args) {
    if (level === 'error') {
      console.error(message, ...args);
      return;
    }
    console.warn(message, ...args);
  },
} satisfies NonNullable<BetterAuthOptions['logger']>;
