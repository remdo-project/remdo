import { inject } from 'vue';
import type { ProviderFactory } from './collaborationRuntime';

export interface CollaborationStatusValue {
  readonly ready: boolean;
  readonly enabled: boolean;
  readonly providerFactory: ProviderFactory;
  readonly hasUnsyncedChanges: boolean;
  waitForSync: () => Promise<void>;
  onReadyChange: (listener: (ready: boolean) => void) => () => void;
}

const missingContextError = new Error('Collaboration context is missing. Wrap the editor in <CollaborationProvider>.');

export const collaborationStatusKey = Symbol('CollaborationStatus');

export function useCollaborationStatus(): CollaborationStatusValue {
  const value = inject<CollaborationStatusValue | null>(collaborationStatusKey, null);

  if (!value) {
    throw missingContextError;
  }

  return value;
}
