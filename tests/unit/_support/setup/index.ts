import process from 'node:process';
import '@testing-library/jest-dom/vitest';
import './_internal/assertions';
import './_internal/env';
import './_internal/lexical';

if (typeof process.setMaxListeners === 'function') {
  process.setMaxListeners(0);
}
