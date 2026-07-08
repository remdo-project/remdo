import type { RemdoTestApi } from './TestBridgePlugin';

// Test-bridge registry (docs/dev/dev-tooling.md). The neutral seam tests use to
// reach an editor's TestBridge without a prod-only Editor prop. It is per-mount:
// each editor that mounts publishes its own bridge, so multiple editors in one
// runtime (collab peers in a unit test, or an e2e page) never clobber a shared
// slot. A test registers `waitForNext()` before rendering to capture exactly the
// bridge that editor mounts.

interface TestBridgeRegistry {
  publish: (api: RemdoTestApi) => void;
  retract: (api: RemdoTestApi) => void;
  waitForNext: () => Promise<RemdoTestApi>;
  /** Live bridges, in mount order — for callers (e2e) that pick by doc id. */
  list: () => RemdoTestApi[];
}

function createTestBridgeRegistry(): TestBridgeRegistry {
  const live = new Set<RemdoTestApi>();
  const waiters: Array<(api: RemdoTestApi) => void> = [];

  return {
    publish(api) {
      live.add(api);
      const waiter = waiters.shift();
      waiter?.(api);
    },
    retract(api) {
      live.delete(api);
    },
    waitForNext() {
      return new Promise<RemdoTestApi>((resolve) => {
        waiters.push(resolve);
      });
    },
    list() {
      return [...live];
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
