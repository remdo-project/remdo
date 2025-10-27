import { env } from '#config/env-client';
import type { ComputedRef } from 'vue';
import { computed, inject, provide, ref, watch } from 'vue';
import type { ProviderFactory } from './collaborationRuntime';
import { CollaborationSyncController, createProviderFactory } from './collaborationRuntime';

const CollaborationStatusKey = Symbol('CollaborationStatus');

export interface CollaborationStatusValue {
  ready: ComputedRef<boolean>;
  enabled: boolean;
  providerFactory: ProviderFactory;
  hasUnsyncedChanges: ComputedRef<boolean>;
  waitForSync: () => Promise<void>;
}

function createCollaborationStatus(): CollaborationStatusValue {
  const enabled = env.collabEnabled;
  const ready = ref(!enabled);
  const unsynced = ref(enabled);

  const endpoint = computed(() => {
    const { protocol, hostname } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
    return `${wsProtocol}://${hostname}:${env.collabPort}`;
  });

  const waiters = new Set<() => void>();

  const flushWaiters = () => {
    if (waiters.size === 0) {
      return;
    }

    const pending = Array.from(waiters);
    waiters.clear();
    for (const release of pending) {
      release();
    }
  };

  const syncController = new CollaborationSyncController((value) => {
    unsynced.value = value;
  }, enabled);

  if (!enabled) {
    syncController.setUnsynced(false);
  }

  const providerFactory = createProviderFactory(
    {
      setReady: (value) => {
        ready.value = value;
      },
      syncController,
    },
    endpoint.value
  );

  const resolvedReady = computed(() => !enabled || ready.value);
  const hasUnsyncedChanges = computed(() => enabled && unsynced.value);

  watch([resolvedReady, hasUnsyncedChanges], ([isReady, hasUnsynced]) => {
    if (!enabled || (isReady && !hasUnsynced)) {
      flushWaiters();
    }
  });

  const waitForSync = () => {
    if (!enabled) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const release = () => {
        waiters.delete(release);
        resolve();
      };

      waiters.add(release);

      const startVersion = syncController.version;

      setTimeout(() => {
        const didChange = syncController.version !== startVersion;
        if (resolvedReady.value && !hasUnsyncedChanges.value && !didChange) {
          release();
        }
      }, 0);
    });
  };

  return {
    ready: resolvedReady,
    enabled,
    providerFactory,
    hasUnsyncedChanges,
    waitForSync,
  };
}

export function provideCollaborationStatus(): CollaborationStatusValue {
  const value = createCollaborationStatus();
  provide(CollaborationStatusKey, value);
  return value;
}

export function useCollaborationStatus(): CollaborationStatusValue {
  const value = inject<CollaborationStatusValue | null>(CollaborationStatusKey, null);
  if (!value) {
    throw new Error('Collaboration context is missing. Wrap the editor in <CollaborationProvider>.');
  }
  return value;
}
