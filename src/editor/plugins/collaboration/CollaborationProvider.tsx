import type { ReactNode } from 'react';
import { createContext, useMemo, use, useEffect, useSyncExternalStore } from 'react';
import { config } from '#config';
import { CollabSession } from '#lib/collaboration/session';

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
}: {
  children: ReactNode;
  docId?: string;
}) {
  const value = useCollaborationRuntimeValue({ docId });

  return <CollaborationStatusContext value={value}>{children}</CollaborationStatusContext>;
}

function resolveDocId(explicit?: string) {
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const doc = globalThis.location.search ? new URLSearchParams(globalThis.location.search).get('doc')?.trim() : null;
  return doc?.length ? doc : config.env.COLLAB_DOCUMENT_ID;
}

function useCollaborationRuntimeValue({ docId }: { docId?: string }): CollaborationStatusValue {
  const enabled = config.env.COLLAB_ENABLED;
  const resolvedDocId = useMemo(() => resolveDocId(docId), [docId]);
  const resolvedOrigin = useMemo(() => {
    // Tests run in jsdom without a proxy; target the collab server directly.
    if (config.env.NODE_ENV === 'test') {
      return `http://${config.env.HOST}:${config.env.COLLAB_SERVER_PORT}`;
    }
    if (location.origin && location.origin !== 'null') {
      return location.origin;
    }
    return `http://${config.env.HOST}:${config.env.COLLAB_SERVER_PORT}`;
  }, []);

  const session = useMemo(
    () => new CollabSession({ origin: resolvedOrigin, enabled, docId: resolvedDocId }),
    [resolvedOrigin, enabled, resolvedDocId]
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

export type { CollaborationStatusValue };
