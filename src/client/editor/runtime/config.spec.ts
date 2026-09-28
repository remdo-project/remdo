import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('#config');
  vi.unstubAllGlobals();
});

it('hands production editor errors to the browser error handlers', async () => {
  vi.resetModules();
  vi.doMock('#config', async (importOriginal) => ({
    config: { ...(await importOriginal<typeof import('#config')>()).config, isDevOrTest: false },
  }));
  const reportError = vi.fn();
  vi.stubGlobal('reportError', reportError);
  const { editorConfig } = await import('./config');
  const failure = new Error('editor failure');

  editorConfig.onError(failure);

  expect(reportError).toHaveBeenCalledWith(failure);
});
