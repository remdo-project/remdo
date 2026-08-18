import type { Provider } from '@lexical/yjs';
import * as Y from 'yjs';

/**
 * Y-Sweet currently tears down its IndexedDB helper eagerly, while async update
 * work may still be in flight. This interop layer defers the actual destroy
 * until those updates finish, so the BroadcastChannel is not closed underneath
 * a pending `handleUpdate()` continuation.
 *
 * It also closes the `IDBDatabase` handle, which Y-Sweet's own `destroy()`
 * never does: it closes only the BroadcastChannel and the doc listener. A
 * connection left open blocks `indexedDB.deleteDatabase()` indefinitely — the
 * spec makes `blocked` an unbounded wait, not a failure — so logout could not
 * clear local data even with a single tab open.
 */
type ProviderWithDestroy = Provider & { destroy: () => void };

interface IndexedDbProviderLike {
  db?: { close?: () => void };
  doc?: Y.Doc;
  destroy: () => void;
  handleUpdate?: (update: Uint8Array, origin: unknown) => void | Promise<void>;
}

const guardedIndexedDbProviders = new WeakSet<object>();

// TODO: Remove once Y-Sweet tears its IndexedDB provider down safely upstream —
// deferring destroy past in-flight updates and closing the database handle.
// Probe: drop this guard and run tests/unit/y-sweet-indexeddb-lifecycle.spec.ts.
export function guardYSweetIndexedDbProviderLifecycle(
  provider: ProviderWithDestroy & { indexedDBProvider?: unknown }
): () => void {
  let ownerDestroyed = false;
  let currentIndexedDbProvider = patchIndexedDbProvider(provider.indexedDBProvider);

  try {
    Object.defineProperty(provider, 'indexedDBProvider', {
      configurable: true,
      enumerable: true,
      get() {
        return currentIndexedDbProvider;
      },
      set(value) {
        currentIndexedDbProvider = patchIndexedDbProvider(value);
        if (ownerDestroyed) {
          currentIndexedDbProvider?.destroy();
        }
      },
    });
  } catch {
    // Ignore provider shape drift and fall back to the current instance only.
  }

  return () => {
    ownerDestroyed = true;
    currentIndexedDbProvider?.destroy();
  };
}

function patchIndexedDbProvider(value: unknown): IndexedDbProviderLike | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as IndexedDbProviderLike;
  if (
    typeof candidate.destroy !== 'function' ||
    !(candidate.doc instanceof Y.Doc) ||
    typeof candidate.handleUpdate !== 'function'
  ) {
    return null;
  }

  if (guardedIndexedDbProviders.has(candidate)) {
    return candidate;
  }
  guardedIndexedDbProviders.add(candidate);

  let closing = false;
  let destroyed = false;
  let activeUpdates = 0;
  const doc = candidate.doc;
  const originalHandleUpdate = candidate.handleUpdate;
  // Drop the `Promise<void>` arm so the listener type matches `doc.off`'s void-returning
  // signature; without it, ts/no-misused-promises flags the removal below.
  // eslint-disable-next-line ts/no-unnecessary-type-assertion -- the assertion narrows void | Promise<void> to void; the two rules conflict here.
  const originalHandleUpdateListener = originalHandleUpdate as (update: Uint8Array, origin: unknown) => void;
  const originalDestroy = candidate.destroy.bind(candidate);

  const finalizeDestroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    originalDestroy();
    candidate.db?.close?.();
  };

  const maybeFinalizeDestroy = () => {
    if (!closing || activeUpdates !== 0) {
      return;
    }
    finalizeDestroy();
  };

  const wrappedHandleUpdate = (update: Uint8Array, origin: unknown): void => {
    if (closing) {
      return;
    }
    activeUpdates += 1;
    void (async () => {
      try {
        await originalHandleUpdate.call(candidate, update, origin);
      } finally {
        activeUpdates -= 1;
        maybeFinalizeDestroy();
      }
    })();
  };

  doc.off('update', originalHandleUpdateListener);
  candidate.handleUpdate = wrappedHandleUpdate;
  doc.on('update', wrappedHandleUpdate);

  candidate.destroy = () => {
    if (closing) {
      return;
    }
    closing = true;
    doc.off('update', wrappedHandleUpdate);
    maybeFinalizeDestroy();
  };

  return candidate;
}
