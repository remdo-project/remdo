import process from 'node:process';
import '@testing-library/jest-dom/vitest';
import './_internal/assertions';
import './_internal/env';
import './_internal/lexical';

if (typeof globalThis !== 'undefined' && process?.env?.USE_LOCAL_COLLAB === 'true') {
  (globalThis as { __USE_LOCAL_COLLAB__?: boolean }).__USE_LOCAL_COLLAB__ = true;
}
