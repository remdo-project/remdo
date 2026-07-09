import type { LexicalEditor } from 'lexical';
import type { RemdoTestApi } from './TestBridgePlugin';

// Test-bridge registry (docs/dev/dev-tooling.md). The neutral seam tests use to
// reach an editor's TestBridge without a prod-only Editor prop. It is per-mount:
// each editor that mounts publishes its own bridge, so multiple editors in one
// runtime (collab peers in a unit test, or an e2e page) never clobber a shared
// slot. A test registers `waitForNext()` before rendering to capture exactly the
// bridge that editor mounts.
//
// Entries are keyed by the editor (stable per mount), so an editor re-publishing
// a fresh bridge — its api is rebuilt whenever collaboration status changes —
// updates its own entry without consuming a waiter meant for another editor.

export interface TestBridgeRegistry {
  publish: (editor: LexicalEditor, api: RemdoTestApi) => void;
  retract: (editor: LexicalEditor) => void;
  waitForNext: () => Promise<RemdoTestApi>;
  /** Live bridges, in mount order — for callers (e2e) that pick by doc id. */
  list: () => RemdoTestApi[];
}

function createTestBridgeRegistry(): TestBridgeRegistry {
  const live = new Map<LexicalEditor, RemdoTestApi>();
  const waiters: Array<(api: RemdoTestApi) => void> = [];

  return {
    publish(editor, api) {
      const isNewMount = !live.has(editor);
      live.set(editor, api);
      // Only a newly mounted editor hands off to a pending `waitForNext()`; a
      // re-publish just refreshes this editor's stored bridge.
      if (isNewMount) {
        waiters.shift()?.(api);
      }
    },
    retract(editor) {
      live.delete(editor);
    },
    waitForNext() {
      return new Promise<RemdoTestApi>((resolve) => {
        waiters.push(resolve);
      });
    },
    list() {
      return [...live.values()];
    },
  };
}

const REGISTRY_KEY = '__remdoTestBridges';

type GlobalWithRegistry = typeof globalThis & {
  [REGISTRY_KEY]?: TestBridgeRegistry;
};

export function getTestBridgeRegistry(): TestBridgeRegistry {
  const holder = globalThis as GlobalWithRegistry;
  holder[REGISTRY_KEY] ??= createTestBridgeRegistry();
  return holder[REGISTRY_KEY];
}
