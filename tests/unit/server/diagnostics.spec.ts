import { describe, expect, it, vi } from 'vitest';
import { meta } from '#tests';
import { reportServerDiagnostic } from '#server/diagnostics';

describe('production diagnostics', () => {
  it(
    'reports only the bounded server event',
    meta({ expectedConsoleIssues: ['[remdo-api] document.create-failed'] }),
    () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      reportServerDiagnostic('document.create-failed');

      expect(consoleError).toHaveBeenCalledWith('[remdo-api] document.create-failed');
    }
  );
});
