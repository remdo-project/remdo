/* eslint-disable react-refresh/only-export-components */
import { useEffect } from 'react';
import type { CollaborationStatusValue } from '@/editor/plugins/collaboration';
import { useCollaborationStatus } from '@/editor/plugins/collaboration';

export type Handler = (payload: unknown) => void;

export function createMockProvider() {
  const listeners = new Map<string, Set<Handler>>();

  return {
    synced: false,
    hasLocalChanges: false,
    destroy: () => {},
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
  };
}

export type MockProvider = ReturnType<typeof createMockProvider>;

export function CollabConsumer({ onReady }: { onReady: (value: CollaborationStatusValue) => void }) {
  const value = useCollaborationStatus();

  useEffect(() => {
    onReady(value);
  }, [onReady, value]);

  return null;
}
