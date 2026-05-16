import { afterEach, describe, expect, it, vi } from 'vitest';
import { REMDO_E2E_TEST_RUNTIME_GLOBAL } from '@/testing/e2e-runtime';

const initialHref = globalThis.location.href;

afterEach(() => {
  history.replaceState({}, '', initialHref);
  delete (globalThis as typeof globalThis & { [REMDO_E2E_TEST_RUNTIME_GLOBAL]?: unknown })[REMDO_E2E_TEST_RUNTIME_GLOBAL];
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('user profile config document id', () => {
  it('uses the fixed app doc id outside e2e routes', async () => {
    history.replaceState({}, '', '/n/main');

    const { getUserConfigDocumentId, USER_CONFIG_DOC_ID } = await import('@/documents/user-profile');

    expect(getUserConfigDocumentId()).toBe(USER_CONFIG_DOC_ID);
  });

  it('uses the injected runtime doc id on e2e routes', async () => {
    history.replaceState({}, '', '/e2e/n/main');
    (globalThis as typeof globalThis & {
      [REMDO_E2E_TEST_RUNTIME_GLOBAL]?: { configDocumentId: string };
    })[REMDO_E2E_TEST_RUNTIME_GLOBAL] = {
      configDocumentId: 'usercfgruntimeOwn',
    };

    const { getUserConfigDocumentId } = await import('@/documents/user-profile');

    expect(getUserConfigDocumentId()).toBe('usercfgruntimeOwn');
  });

  it('falls back to an in-memory e2e doc id without touching sessionStorage', async () => {
    history.replaceState({}, '', '/e2e/n/main');
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const { getUserConfigDocumentId, USER_CONFIG_DOC_ID } = await import('@/documents/user-profile');

    const first = getUserConfigDocumentId();
    const second = getUserConfigDocumentId();

    expect(first).toBe(second);
    expect(first.startsWith(USER_CONFIG_DOC_ID)).toBe(true);
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
