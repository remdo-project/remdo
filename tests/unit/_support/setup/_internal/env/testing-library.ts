import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { TESTING_LIBRARY_ASYNC_TIMEOUT_MS } from '../../../timeouts';

configure({ asyncUtilTimeout: TESTING_LIBRARY_ASYNC_TIMEOUT_MS });

afterEach(() => {
  cleanup();
});
