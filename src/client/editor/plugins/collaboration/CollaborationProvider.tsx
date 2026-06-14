import type { ReactNode } from 'react';
import { createContext, useMemo, use, useEffect, useSyncExternalStore } from 'react';
import { config } from '#config';
import { CollabSession } from '#collaboration/session';
import { createSourceDocumentSyncTokenApiPath } from '#document-routes';
import { normalizeNoteIdOrThrow } from '#domain/notes/ids';
import { resolveApiServerOrigin, resolveAppOrigin, resolveCollabServerOrigin } from '#platform/net/origins';

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
  sourceOrigin = null,
  sourceId = null,
}: {
  children: ReactNode;
  docId: string;
  sourceOrigin?: string | null;
  sourceId?: string | null;
}) {
  const value = useCollaborationRuntimeValue({ docId, sourceOrigin, sourceId });

  return <CollaborationStatusContext value={value}>{children}</CollaborationStatusContext>;
}

function useCollaborationRuntimeValue({
  docId,
  sourceOrigin,
  sourceId,
}: {
  docId: string;
  sourceOrigin: string | null;
  sourceId: string | null;
}): CollaborationStatusValue {
  const enabled = config.env.COLLAB_ENABLED;
  const resolvedDocId = useMemo(
    () => normalizeNoteIdOrThrow(docId, 'CollaborationProvider requires a valid docId.'),
    [docId],
  );
  const resolvedOrigin = useMemo(() => {
    // Tests run in jsdom without a proxy; target the collab server directly.
    if (config.env.NODE_ENV === 'test') {
      return resolveCollabServerOrigin({ loopback: true });
    }
    if (location.origin && location.origin !== 'null') {
      return location.origin;
    }
    return resolveAppOrigin({ loopback: true });
  }, []);
  const resolvedApiOrigin = useMemo(() => {
    if (config.env.NODE_ENV === 'test') {
      return resolveApiServerOrigin({ loopback: true });
    }
    if (location.origin && location.origin !== 'null') {
      return location.origin;
    }
    return resolveAppOrigin({ loopback: true });
  }, []);

  const session = useMemo(
    () => new CollabSession({
      origin: sourceOrigin ?? resolvedOrigin,
      apiOrigin: resolvedApiOrigin,
      createSyncTokenPath: sourceId
        ? (tokenDocId) => createSourceDocumentSyncTokenApiPath(sourceId, tokenDocId)
        : undefined,
      enabled,
      docId: resolvedDocId,
    }),
    [resolvedApiOrigin, resolvedOrigin, enabled, resolvedDocId, sourceOrigin, sourceId]
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
