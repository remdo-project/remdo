export const REMDO_E2E_TEST_RUNTIME_GLOBAL = '__remdoE2eTestRuntime';

export function isE2ERoute(): boolean {
  return typeof location !== 'undefined' && location.pathname.startsWith('/e2e/');
}

function readE2ETestRuntime(): { configDocumentId?: unknown } | null {
  if (!isE2ERoute()) {
    return null;
  }

  const runtime = (globalThis as Record<string, unknown>)[REMDO_E2E_TEST_RUNTIME_GLOBAL];
  return runtime && typeof runtime === 'object' ? runtime : null;
}

export function getInjectedE2EConfigDocumentId(): string | null {
  const docId = readE2ETestRuntime()?.configDocumentId;
  return typeof docId === 'string' && docId.length > 0 ? docId : null;
}
