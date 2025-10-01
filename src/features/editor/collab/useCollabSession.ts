import { useCallback, useMemo, useSyncExternalStore } from "react";
import * as Y from "yjs";

import type { DocumentProvider, DocumentProviderFactory } from "./types";

type SessionState = {
  doc: Y.Doc | null;
  provider: DocumentProvider | null;
  synced: boolean;
};

const DEFAULT_STATE: SessionState = { doc: null, provider: null, synced: false };
const sessions = new Map<string, SessionState>();
const listeners = new Map<string, Set<() => void>>();

function notify(id: string) {
  const subs = listeners.get(id);
  if (!subs) {
    return;
  }
  for (const listener of subs) {
    listener();
  }
}

function subscribe(id: string, listener: () => void) {
  let subs = listeners.get(id);
  if (!subs) {
    subs = new Set();
    listeners.set(id, subs);
  }
  subs.add(listener);
  return () => {
    subs?.delete(listener);
    if (subs && subs.size === 0) {
      listeners.delete(id);
    }
  };
}

function getSession(id: string): SessionState {
  return sessions.get(id) ?? DEFAULT_STATE;
}

function setSession(id: string, state: SessionState) {
  sessions.set(id, state);
  notify(id);
}

function clearSession(id: string) {
  if (sessions.delete(id)) {
    notify(id);
  }
}

function updateSession(id: string, partial: Partial<SessionState>) {
  const current = getSession(id);
  const next: SessionState = {
    doc: partial.doc !== undefined ? partial.doc : current.doc,
    provider: partial.provider !== undefined ? partial.provider : current.provider,
    synced: partial.synced !== undefined ? partial.synced : current.synced,
  };

  if (next.doc === null && next.provider === null && !next.synced) {
    clearSession(id);
    return;
  }

  setSession(id, next);
}

function createDocument(): Y.Doc {
  const doc = new Y.Doc({ gc: false });
  ensureRoot(doc);
  return doc;
}

function ensureRoot(doc: Y.Doc) {
  if (!doc.share.has("root")) {
    doc.get("root", Y.XmlText);
  }
}

export function createCollabProvider(
  id: string,
  yjsDocMap: Map<string, Y.Doc>,
  factory: DocumentProviderFactory,
): DocumentProvider {
  const previous = getSession(id);
  if (previous.provider) {
    previous.provider.destroy();
  }

  let doc = yjsDocMap.get(id) ?? previous.doc;
  if (doc) {
    doc.load();
  } else {
    doc = createDocument();
    yjsDocMap.set(id, doc);
  }

  ensureRoot(doc);
  updateSession(id, { doc, synced: false, provider: null });

  const provider = factory(doc, id);

  const handleSynced = (value: boolean) => {
    const current = getSession(id);
    if (current.provider !== provider) {
      return;
    }
    updateSession(id, { synced: value });
  };

  const handleDestroy = () => {
    const current = getSession(id);
    if (current.provider !== provider) {
      return;
    }
    provider.off("synced", handleSynced);
    provider.off("destroy", handleDestroy);
    clearSession(id);
  };

  provider.on("synced", handleSynced);
  provider.on("destroy", handleDestroy);

  updateSession(id, { provider, synced: Boolean(provider.synced) });

  return provider;
}

export function resetCollabSession(id: string): void {
  const current = getSession(id);
  if (current.provider) {
    current.provider.destroy();
    return;
  }
  if (current !== DEFAULT_STATE) {
    clearSession(id);
  }
}

export function clearCollabSessions(): void {
  for (const id of Array.from(sessions.keys())) {
    resetCollabSession(id);
  }
}

export function useCollabSession(id: string): {
  yDoc: Y.Doc | null;
  yjsProvider: DocumentProvider | null;
  synced: boolean;
} {
  const subscribeToSession = useCallback((listener: () => void) => subscribe(id, listener), [id]);
  const getSnapshot = useCallback(() => getSession(id), [id]);
  const state = useSyncExternalStore(subscribeToSession, getSnapshot, getSnapshot);

  return useMemo(
    () => ({ yDoc: state.doc, yjsProvider: state.provider, synced: state.synced }),
    [state],
  );
}
