import '@testing-library/jest-dom/vitest';
import { registerConsoleGuards } from './console';
import { registerLexicalMatchers } from './matchers';

let registered = false;

export function registerAssertions(): void {
  if (registered) return;

  registerConsoleGuards();
  registerLexicalMatchers();
  registered = true;
}
