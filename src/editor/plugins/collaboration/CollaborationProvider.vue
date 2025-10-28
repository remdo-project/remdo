<script setup lang="ts">
import { provide } from 'vue';
import { env } from '#config/env-client';
import { CollaborationSyncController, createProviderFactory } from './collaborationRuntime';
import { collaborationStatusKey } from './status';
import type { CollaborationStatusValue } from './status';
import type { ProviderFactory } from './collaborationRuntime';

class CollaborationStatus implements CollaborationStatusValue {
  private readyInternal: boolean;
  private unsyncedInternal: boolean;
  private providerFactoryInternal: ProviderFactory = () => {
    throw new Error('Collaboration provider not initialized');
  };
  private readonly waiters = new Set<() => void>();
  private readonly readyListeners = new Set<(ready: boolean) => void>();

  constructor(private readonly enabledInternal: boolean) {
    this.readyInternal = !enabledInternal;
    this.unsyncedInternal = enabledInternal;
  }

  get ready(): boolean {
    return !this.enabledInternal || this.readyInternal;
  }

  get enabled(): boolean {
    return this.enabledInternal;
  }

  get providerFactory(): ProviderFactory {
    return this.providerFactoryInternal;
  }

  get hasUnsyncedChanges(): boolean {
    return this.enabledInternal && this.unsyncedInternal;
  }

  waitForSync(): Promise<void> {
    if (!this.enabledInternal || (this.readyInternal && !this.unsyncedInternal)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const release = () => {
        this.waiters.delete(release);
        resolve();
      };

      this.waiters.add(release);

      if (!this.enabledInternal || (this.readyInternal && !this.unsyncedInternal)) {
        release();
      }
    });
  }

  onReadyChange(listener: (ready: boolean) => void): () => void {
    this.readyListeners.add(listener);
    listener(this.ready);
    return () => {
      this.readyListeners.delete(listener);
    };
  }

  setProviderFactory(factory: ProviderFactory): void {
    this.providerFactoryInternal = factory;
  }

  setUnsynced(value: boolean): void {
    if (this.unsyncedInternal === value) {
      return;
    }

    this.unsyncedInternal = value;
    this.flushWaiters();
  }

  setReady(value: boolean): void {
    if (this.readyInternal === value) {
      return;
    }

    this.readyInternal = value;
    this.readyListeners.forEach((listener) => {
      listener(this.ready);
    });
    this.flushWaiters();
  }

  private flushWaiters() {
    if (!this.enabledInternal || (this.readyInternal && !this.unsyncedInternal)) {
      if (this.waiters.size === 0) {
        return;
      }

      const pending = Array.from(this.waiters);
      this.waiters.clear();
      for (const release of pending) {
        release();
      }
    }
  }
}

const enabled = env.collabEnabled;
const status = new CollaborationStatus(enabled);

const syncController = new CollaborationSyncController((value) => {
  status.setUnsynced(value);
}, enabled);

const endpoint = (() => {
  if (typeof window === 'undefined') {
    return '';
  }

  const { protocol, hostname } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
  return `${wsProtocol}://${hostname}:${env.collabPort}`;
})();

const providerFactory = createProviderFactory(
  {
    setReady: (value: boolean) => {
      status.setReady(value);
    },
    syncController,
  },
  endpoint,
);

status.setProviderFactory(providerFactory);

provide(collaborationStatusKey, status);
</script>

<template>
  <slot />
</template>
