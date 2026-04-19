import { afterEach, describe, expect, it, vi } from 'vitest';
import { REMDO_E2E_TEST_RUNTIME_GLOBAL } from '@/testing/e2e-runtime';

const initialHref = globalThis.location.href;

afterEach(() => {
  history.replaceState({}, '', initialHref);
  delete (globalThis as typeof globalThis & { [REMDO_E2E_TEST_RUNTIME_GLOBAL]?: unknown })[REMDO_E2E_TEST_RUNTIME_GLOBAL];
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('user config doc id', () => {
  it('uses the fixed app doc id outside e2e routes', async () => {
    history.replaceState({}, '', '/n/main');

    const { getUserConfigDocId, USER_CONFIG_DOC_ID } = await import('@/documents/user-config-doc-id');

    expect(getUserConfigDocId()).toBe(USER_CONFIG_DOC_ID);
  });

  it('uses the injected runtime doc id on e2e routes', async () => {
    history.replaceState({}, '', '/e2e/n/main');
    (globalThis as typeof globalThis & {
      [REMDO_E2E_TEST_RUNTIME_GLOBAL]?: { userConfigDocId: string };
    })[REMDO_E2E_TEST_RUNTIME_GLOBAL] = {
      userConfigDocId: 'usercfgruntimeOwn',
    };

    const { getUserConfigDocId } = await import('@/documents/user-config-doc-id');

    expect(getUserConfigDocId()).toBe('usercfgruntimeOwn');
  });

  it('falls back to an in-memory e2e doc id without touching sessionStorage', async () => {
    history.replaceState({}, '', '/e2e/n/main');
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const { getUserConfigDocId, USER_CONFIG_DOC_ID } = await import('@/documents/user-config-doc-id');

    const first = getUserConfigDocId();
    const second = getUserConfigDocId();

    expect(first).toBe(second);
    expect(first.startsWith(USER_CONFIG_DOC_ID)).toBe(true);
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
