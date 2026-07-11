import { describe, expect, it, vi } from 'vitest';
import { meta } from '#tests';
import { resolveAuthLogger } from '#server/auth/logging';
import { reportServerDiagnostic } from '#server/diagnostics';

describe('production diagnostics', () => {
  it('disables Better Auth logging in production', () => {
    expect(resolveAuthLogger(true)).toEqual({ disabled: true });
    expect(resolveAuthLogger(false)).toEqual({ level: 'error' });
  });

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
