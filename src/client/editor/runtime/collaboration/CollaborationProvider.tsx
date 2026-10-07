import type { ReactNode } from 'react';
import { createContext, useMemo, use, useEffect, useSyncExternalStore } from 'react';
import { config } from '#config';
import { CollabSession } from '#collaboration/session';
import { normalizeNoteIdOrThrow } from '#domain/notes/ids';

function createCollaborationStatusValue(snapshot: ReturnType<CollabSession['snapshot']>, session: CollabSession) {
  return {
    ...snapshot,
    awaitSynced: () => session.awaitSynced(),
    session,
  };
}

type CollaborationStatusValue = ReturnType<typeof createCollaborationStatusValue>;

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
  docId,
  accountId,
}: {
  children: ReactNode;
  docId: string;
  accountId?: string;
}) {
  const value = useCollaborationRuntimeValue({ docId, accountId });

  return <CollaborationStatusContext value={value}>{children}</CollaborationStatusContext>;
}

function useCollaborationRuntimeValue({
  docId,
  accountId,
}: {
  docId: string;
  accountId?: string;
}): CollaborationStatusValue {
  const enabled = config.env.COLLAB_ENABLED;
  const resolvedDocId = useMemo(
    () => normalizeNoteIdOrThrow(docId, 'CollaborationProvider requires a valid docId.'),
    [docId],
  );
  const session = useMemo(
    () => new CollabSession({
      accountId,
      enabled,
      docId: resolvedDocId,
    }),
    [accountId, enabled, resolvedDocId]
  );

  useEffect(() => () => session.destroy(), [session]);

  const snapshot = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.snapshot(),
    () => session.snapshot()
  );

  return useMemo(
    () => createCollaborationStatusValue(snapshot, session),
    [session, snapshot]
  );
}
