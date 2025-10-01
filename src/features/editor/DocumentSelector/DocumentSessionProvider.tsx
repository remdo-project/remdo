/* eslint-disable react-refresh/only-export-components, react/no-use-context */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCollaborationDisabled } from "../config";
import {
  createCollaborationProviderFactory,
  getCollaborationEndpoint,
} from "../collab/createCollaborationProviderFactory";
import { CollabFactoryContext } from "../collab/useCollabFactory";
import {
  clearCollabSessions,
  createCollabProvider,
  resetCollabSession,
  useCollabSession,
} from "../collab/useCollabSession";
import type { DocumentProvider, ProviderFactory } from "../collab/types";
import type * as Y from "yjs";

export type DocumentSession = {
  id: string;
  setId: (id: string, mode?: "push" | "replace" | "silent") => void;
  yjsProvider: DocumentProvider | null;
  yDoc: Y.Doc | null;
  reset: () => void;
  synced: boolean;
  collabDisabled: boolean;
  editorKey: string;
  ready: boolean;
  switchEpoch: number;
  whenReady: (opts?: { since?: number; timeout?: number }) => Promise<void>;
};

type ReadyWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type DocumentSessionInternal = DocumentSession & {
  /** @internal */
  _notifyEditorReady: (epoch: number) => void;
};

declare global {
  interface Window {
    REMDO_TEST?: boolean;
    __remdoDocumentSession?: DocumentSessionInternal;
  }
}

const DocumentSessionContext = createContext<DocumentSessionInternal | null>(null);

function makeSearchWithDoc(id: string, current: URLSearchParams) {
  const next = new URLSearchParams(current);
  next.set("documentID", id);
  return `?${next.toString()}`;
}

export const useDocumentSelector = (): DocumentSession => {
  const context = useContext(DocumentSessionContext);
  if (!context) {
    throw new Error("useDocumentSelector must be used within a DocumentSelectorProvider");
  }
  return context;
};

export const DocumentSelectorProvider = ({ children }: { children: ReactNode }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [documentID, setDocumentIdState] = useState(() => searchParams.get("documentID") ?? "main");
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [ready, setReady] = useState(false);
  const [switchEpoch, setSwitchEpoch] = useState(0);
  const collabDisabled = useCollaborationDisabled();
  const { yDoc, yjsProvider, synced } = useCollabSession(documentID);
  const lastSearchParamIdRef = useRef<string | null>(searchParams.get("documentID"));
  const skipNextProviderEpochRef = useRef(true);
  const switchEpochRef = useRef(0);
  const readyEpochRef = useRef(-1);
  const waitersRef = useRef<Map<number, Set<ReadyWaiter>>>(new Map());

  const cancelWaiters = useCallback((epoch: number, error: Error) => {
    const waiters = waitersRef.current.get(epoch);
    if (!waiters) {
      return;
    }
    waitersRef.current.delete(epoch);
    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }, []);

  const beginNewEpoch = useCallback(() => {
    const previousEpoch = switchEpochRef.current;
    if (waitersRef.current.has(previousEpoch)) {
      cancelWaiters(previousEpoch, new Error("Document session changed before readiness."));
    }
    switchEpochRef.current = previousEpoch + 1;
    setSwitchEpoch(switchEpochRef.current);
    setReady(false);
  }, [cancelWaiters]);

  const whenReady = useCallback(
    (opts?: { since?: number; timeout?: number }) => {
      const since = opts?.since ?? -1;
      if (ready && readyEpochRef.current > since) {
        return Promise.resolve();
      }

      const epoch = switchEpochRef.current;
      const timeoutMs = opts?.timeout ?? 3000;

      return new Promise<void>((resolve, reject) => {
        let waiter: ReadyWaiter;
        const removeWaiter = () => {
          const waiters = waitersRef.current.get(epoch);
          if (!waiters) {
            return;
          }
          waiters.delete(waiter);
          if (waiters.size === 0) {
            waitersRef.current.delete(epoch);
          }
        };

        const timeoutId = setTimeout(() => {
          removeWaiter();
          reject(new Error(`Document readiness timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        waiter = {
          timer: timeoutId,
          resolve: () => {
            clearTimeout(timeoutId);
            removeWaiter();
            resolve();
          },
          reject: (error: Error) => {
            clearTimeout(timeoutId);
            removeWaiter();
            reject(error);
          },
        };

        const waiters = waitersRef.current.get(epoch);
        if (!waiters) {
          waitersRef.current.set(epoch, new Set([waiter]));
        } else {
          waiters.add(waiter);
        }
      });
    },
    [ready],
  );

  const notifyEditorReady = useCallback((epoch: number) => {
    if (epoch !== switchEpochRef.current) {
      return;
    }
    readyEpochRef.current = epoch;
    setReady(true);
    const waiters = waitersRef.current.get(epoch);
    if (!waiters) {
      return;
    }
    waitersRef.current.delete(epoch);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
  }, []);

  const setDocumentIdSilently = useCallback((id: string) => {
    let changed = false;
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setDocumentIdState((prev) => {
      if (prev === id) {
        return prev;
      }
      changed = true;
      return id;
    });
    if (changed) {
      beginNewEpoch();
      skipNextProviderEpochRef.current = true;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      setEditorEpoch((value) => value + 1);
    }
  }, [beginNewEpoch]);

  const selectDocument = useCallback(
    (id: string, opts?: { replace?: boolean; path?: string }) => {
      if (documentID === id) {
        return;
      }

      navigate(
        { pathname: opts?.path ?? "/", search: makeSearchWithDoc(id, searchParams) },
        { replace: !!opts?.replace },
      );
      setDocumentIdSilently(id);
    },
    [documentID, navigate, searchParams, setDocumentIdSilently],
  );

  const baseProviderFactory = useMemo(
    () =>
      createCollaborationProviderFactory({
        endpoint: getCollaborationEndpoint(),
        roomPrefix: "notes/0/",
      }),
    [],
  );

  const providerFactory = useMemo<ProviderFactory>(() => {
    if (collabDisabled) {
      return (_id: string, _docMap: Map<string, Y.Doc>) => {
        throw new Error("Collaboration is disabled; no provider is available.");
      };
    }
    return (id: string, yjsDocMap: Map<string, Y.Doc>) => {
      const provider = createCollabProvider(id, yjsDocMap, baseProviderFactory);
      if (skipNextProviderEpochRef.current) {
        skipNextProviderEpochRef.current = false;
      } else {
        setEditorEpoch((value) => value + 1);
      }
      return provider;
    };
  }, [baseProviderFactory, collabDisabled]);

  const reset = useCallback(() => {
    beginNewEpoch();
    skipNextProviderEpochRef.current = true;
    setEditorEpoch((value) => value + 1);
    resetCollabSession(documentID);
  }, [beginNewEpoch, documentID]);

  const setId = useCallback(
    (id: string, mode: "push" | "replace" | "silent" = "push") => {
      if (mode === "silent") {
        setDocumentIdSilently(id);
        return;
      }
      if (mode === "replace") {
        selectDocument(id, { replace: true });
        return;
      }
      selectDocument(id);
    },
    [selectDocument, setDocumentIdSilently],
  );

  const contextValue = useMemo(
    () =>
      ({
        id: documentID,
        setId,
        yjsProvider,
        yDoc,
        reset,
        synced,
        collabDisabled,
        editorKey: `${documentID}:${editorEpoch}`,
        ready,
        switchEpoch,
        whenReady,
        _notifyEditorReady: notifyEditorReady,
      }) satisfies DocumentSessionInternal,
    [collabDisabled, documentID, editorEpoch, notifyEditorReady, ready, reset, setId, switchEpoch, synced, whenReady, yDoc, yjsProvider],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (window.REMDO_TEST !== true) {
      return;
    }

    // Expose the live session during tests to make it observable without an additional probe component.
    window.__remdoDocumentSession = contextValue;
    return () => {
      if (window.__remdoDocumentSession === contextValue) {
        delete window.__remdoDocumentSession;
      }
    };
  }, [contextValue]);

  useEffect(() => {
    const nextSearchParamId = searchParams.get("documentID");
    if (lastSearchParamIdRef.current === nextSearchParamId) {
      return;
    }

    lastSearchParamIdRef.current = nextSearchParamId;
    const normalizedId = nextSearchParamId ?? "main";
    setDocumentIdSilently(normalizedId);
  }, [searchParams, setDocumentIdSilently]);

  useEffect(() => {
    if (!collabDisabled) {
      return;
    }

    clearCollabSessions();
  }, [collabDisabled]);

  return (
    <CollabFactoryContext value={providerFactory}>
      <DocumentSessionContext value={contextValue}>{children}</DocumentSessionContext>
    </CollabFactoryContext>
  );
};
