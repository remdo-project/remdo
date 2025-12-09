import type { ReactNode } from 'react';
import { createContext, useMemo, use, useEffect, useSyncExternalStore } from 'react';
import { config } from '#config';
import { CollabSession } from '#lib/collaboration/session';

interface CollaborationStatusValue {
  hydrated: boolean;
  synced: boolean;
  docEpoch: number;
  enabled: boolean;
  awaitSynced: () => Promise<void>;
  docId: string;
  session: CollabSession;
}

const missingContextError = new Error('Collaboration context is missing. Wrap the editor in <CollaborationProvider>.');

const CollaborationStatusContext = createContext<CollaborationStatusValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- Safe: hook reads context without holding component state.
export function useCollaborationStatus(): CollaborationStatusValue {
  const value = use(CollaborationStatusContext);

  if (!value) {
    throw missingContextError;
  }

  return value;
}

export function CollaborationProvider({
  children,
  collabOrigin,
  docId,
}: {
  children: ReactNode;
  collabOrigin?: string;
  docId?: string;
}) {
  const value = useCollaborationRuntimeValue({ collabOrigin, docId });

  return <CollaborationStatusContext value={value}>{children}</CollaborationStatusContext>;
}

function resolveDocId(explicit?: string) {
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const doc = globalThis.location.search ? new URLSearchParams(globalThis.location.search).get('doc')?.trim() : null;
  return doc?.length ? doc : config.env.COLLAB_DOCUMENT_ID;
}

function useCollaborationRuntimeValue({ collabOrigin, docId }: { collabOrigin?: string; docId?: string }): CollaborationStatusValue {
  const resolvedCollabOrigin =
    collabOrigin
    || config.env.COLLAB_ORIGIN
    || location.origin;
  const enabled = config.env.COLLAB_ENABLED;
  const resolvedDocId = useMemo(() => resolveDocId(docId), [docId]);

  const session = useMemo(
    () => new CollabSession({ origin: resolvedCollabOrigin, enabled, docId: resolvedDocId }),
    [resolvedCollabOrigin, enabled, resolvedDocId]
  );

  useEffect(() => () => session.destroy(), [session]);

  const snapshot = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.snapshot(),
    () => session.snapshot()
  );

  return useMemo<CollaborationStatusValue>(
    () => ({
      ...snapshot,
      awaitSynced: () => session.awaitSynced(),
      session,
    }),
    [session, snapshot]
  );
}

export type { CollaborationStatusValue };
