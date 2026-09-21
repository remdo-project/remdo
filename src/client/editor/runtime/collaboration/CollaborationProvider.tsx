import type { ReactNode } from 'react';
import { createContext, useMemo, use, useEffect, useSyncExternalStore } from 'react';
import { config } from '#config';
import { CollabSession } from '#collaboration/session';
import { normalizeNoteIdOrThrow } from '#domain/notes/ids';
import {
  resolveCollabServerOrigin,
  resolveLocalGatewayOrigin,
} from '#platform/net/origins';

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
  const resolvedOrigin = useMemo(() => {
    // Tests run in jsdom without a proxy; target the collab server directly.
    if (config.env.NODE_ENV === 'test') {
      return resolveCollabServerOrigin();
    }
    if (location.origin && location.origin !== 'null') {
      return location.origin;
    }
    return resolveLocalGatewayOrigin();
  }, []);

  const session = useMemo(
    () => new CollabSession({
      origin: resolvedOrigin,
      accountId,
      enabled,
      docId: resolvedDocId,
    }),
    [resolvedOrigin, accountId, enabled, resolvedDocId]
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
