import type * as Y from 'yjs';
import type {
  CollaborationSessionProvider,
  MinimalProviderEvents,
  ProviderFactory,
  ProviderFactoryResult,
} from '#lib/collaboration/runtime';

type Handler = (payload: unknown) => void;

export interface MockProvider extends MinimalProviderEvents {
  synced: boolean;
  hasLocalChanges: boolean;
  status: CollaborationSessionProvider['status'];
  emit: (event: string, payload?: unknown) => void;
  destroy: () => void;
}

export function createMockProvider(): MockProvider {
  const listeners = new Map<string, Set<Handler>>();

  return {
    synced: false,
    hasLocalChanges: false,
    status: 'offline',
    on(event: string, handler: Handler) {
      const set = listeners.get(event) ?? new Set<Handler>();
      set.add(handler);
      listeners.set(event, set);
    },
    off(event: string, handler: Handler) {
      const set = listeners.get(event);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) {
        listeners.delete(event);
      }
    },
    emit(event: string, payload?: unknown) {
      const set = listeners.get(event);
      if (!set) return;
      for (const handler of Array.from(set)) {
        handler(payload);
      }
    },
    destroy() {
      listeners.clear();
    },
  };
}

export function createMockProviderFactory(provider: MockProvider): ProviderFactory {
  return (id: string, map: Map<string, Y.Doc>) => ({
    provider: provider as unknown as ProviderFactoryResult['provider'],
    doc: map.get(id)!,
  });
}
