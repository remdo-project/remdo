import { Doc } from 'yjs';
import { createLocalPersistence } from '#collaboration/local-persistence';
import type { LocalPersistence } from '#collaboration/local-persistence';
export { Doc } from 'yjs';
export { createLocalPersistence, LOCAL_PERSISTENCE_KEY_PREFIX } from '#collaboration/local-persistence';
export { clearLocalUserData } from '#client/app/session/local-data';


let doc: Doc;
let cache: LocalPersistence;
let revoked = false;
export async function open(accountId: string) {
  doc = new Doc();
  cache = createLocalPersistence('cross-tab', doc, { accountId, onRevoked: () => { revoked = true; } });
  await cache.whenSynced;
}
export async function write(value: string) {
  doc.getText('text').insert(0, value);
  await cache.flush();
}
export function read() { return { text: doc.getText('text').toString(), revoked }; }
export async function close() { await cache.destroy(); }

let releaseKeyGeneration: () => void;
let pendingCleanup: Promise<void>;
let restoreKeyGeneration: () => void;
let pendingAccountId: string;
let revocations = 0;

export async function openDeferredCache(accountId: string) {
  pendingAccountId = accountId;
  const descriptor = Object.getOwnPropertyDescriptor(crypto.subtle, 'generateKey');
  const generateKey = crypto.subtle.generateKey.bind(crypto.subtle);
  let keyGenerationStarted!: () => void;
  const started = new Promise<void>((resolve) => { keyGenerationStarted = resolve; });
  const released = new Promise<void>((resolve) => { releaseKeyGeneration = resolve; });
  Object.defineProperty(crypto.subtle, 'generateKey', {
    configurable: true,
    value: async (...args: Parameters<SubtleCrypto['generateKey']>) => {
      keyGenerationStarted();
      await released;
      return generateKey(...args);
    },
  });
  restoreKeyGeneration = () => {
    if (descriptor) Object.defineProperty(crypto.subtle, 'generateKey', descriptor);
    else Reflect.deleteProperty(crypto.subtle, 'generateKey');
  };
  const pendingDoc = new Doc();
  pendingDoc.getText('private').insert(0, 'must never persist after logout');
  const pending = createLocalPersistence('pending-key', pendingDoc, {
    accountId,
    onRevoked: () => { revocations += 1; void pending.destroy(); },
  });
  await started;
  pendingCleanup = pending.destroy();
}

export async function finishDeferredCache() {
  releaseKeyGeneration();
  try {
    await pendingCleanup;
    return {
      revocations,
      keyRemains: localStorage.getItem(`remdo-encrypted-v1-key:${pendingAccountId}`) !== null,
      databaseRemains: (await indexedDB.databases()).some(({ name }) => name?.includes(pendingAccountId)),
    };
  } finally {
    restoreKeyGeneration();
  }
}
