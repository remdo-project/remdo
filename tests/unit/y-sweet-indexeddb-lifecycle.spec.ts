import type { Provider } from '@lexical/yjs';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { guardYSweetIndexedDbProviderLifecycle } from '#collaboration/y-sweet-indexeddb-lifecycle';

interface FakeIndexedDbProvider {
  db: { close: () => void };
  doc: Y.Doc;
  destroy: () => void;
  handleUpdate: (update: Uint8Array, origin: unknown) => Promise<void>;
}

function createProvider(handleUpdate?: FakeIndexedDbProvider['handleUpdate']) {
  const doc = new Y.Doc();
  const close = vi.fn();
  const destroy = vi.fn();
  const indexedDBProvider: FakeIndexedDbProvider = {
    db: { close },
    doc,
    destroy,
    handleUpdate: handleUpdate ?? (async () => {}),
  };
  // Mirror Y-Sweet: an async handleUpdate registered on the doc. The cast drops
  // the Promise arm to match `doc.on`'s void signature, as the guard also does.
  doc.on('update', indexedDBProvider.handleUpdate as (update: Uint8Array, origin: unknown) => void);

  const owner = {
    destroy: vi.fn(),
    indexedDBProvider,
  } as unknown as Provider & { destroy: () => void; indexedDBProvider?: unknown };

  return { close, destroy, doc, owner };
}

describe('y-sweet IndexedDB provider lifecycle guard', () => {
  it('closes the IndexedDB connection on teardown so a later delete is not blocked', () => {
    const { close, owner } = createProvider();

    const teardown = guardYSweetIndexedDbProviderLifecycle(owner);
    expect(close).not.toHaveBeenCalled();

    teardown();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes the connection only after an in-flight update settles', async () => {
    let releaseUpdate!: () => void;
    const updateGate = new Promise<void>((resolve) => {
      releaseUpdate = resolve;
    });
    const { close, doc, owner } = createProvider(async () => {
      await updateGate;
    });

    const teardown = guardYSweetIndexedDbProviderLifecycle(owner);
    doc.getMap('notes').set('a', 1);
    teardown();

    // The update has not settled, so teardown must not close the handle yet.
    expect(close).not.toHaveBeenCalled();

    releaseUpdate();
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  it('closes the connection once when teardown runs repeatedly', () => {
    const { close, owner } = createProvider();

    const teardown = guardYSweetIndexedDbProviderLifecycle(owner);
    teardown();
    teardown();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
