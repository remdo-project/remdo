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
};

type DocumentSessionContextValue = DocumentSession & {
  /** @internal */
  _notifyEditorReady: (epoch: number) => void;
};

const DocumentSessionContext = createContext<DocumentSessionContextValue | null>(null);

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

/** @internal */
export const useDocumentSessionInternal = (): DocumentSessionContextValue => {
  const context = useContext(DocumentSessionContext);
  if (!context) {
    throw new Error("useDocumentSessionInternal must be used within a DocumentSelectorProvider");
  }
  return context;
};

export const DocumentSelectorProvider = ({ children }: { children: ReactNode }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [documentID, setDocumentIdState] = useState(() => searchParams.get("documentID") ?? "main");
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [switchEpoch, setSwitchEpoch] = useState(0);
  const [ready, setReady] = useState(false);
  const collabDisabled = useCollaborationDisabled();
  const { yDoc, yjsProvider, synced } = useCollabSession(documentID);
  const lastSearchParamIdRef = useRef<string | null>(searchParams.get("documentID"));
  const skipNextProviderEpochRef = useRef(true);
  const switchEpochRef = useRef(0);
  const readyEpochRef = useRef(-1);
  const waitersRef = useRef<Map<number, Set<ReadyWaiter>>>(new Map());

  useEffect(() => {
    switchEpochRef.current = switchEpoch;
  }, [switchEpoch]);

  const removeWaiter = useCallback((epoch: number, waiter: ReadyWaiter) => {
    const waiters = waitersRef.current.get(epoch);
    if (!waiters) {
      return;
    }
    waiters.delete(waiter);
    if (waiters.size === 0) {
      waitersRef.current.delete(epoch);
    }
  }, []);

  const rejectAllWaiters = useCallback((error: Error) => {
    const pending: ReadyWaiter[] = [];
    for (const waiters of waitersRef.current.values()) {
      pending.push(...waiters);
    }
    waitersRef.current.clear();
    for (const waiter of pending) {
      waiter.reject(error);
    }
  }, []);

  const beginEpoch = useCallback(() => {
    readyEpochRef.current = -1;
    setReady(false);
    rejectAllWaiters(new Error("Document switched before ready"));
    setSwitchEpoch((value) => {
      const next = value + 1;
      switchEpochRef.current = next;
      return next;
    });
  }, [rejectAllWaiters]);

  const whenReady = useCallback(
    (opts?: { since?: number; timeout?: number }) => {
      const since = opts?.since ?? -1;
      const timeoutMs = Math.max(opts?.timeout ?? 3000, 0);

      if (readyEpochRef.current > since && switchEpochRef.current === readyEpochRef.current) {
        return Promise.resolve();
      }

      const epoch = switchEpochRef.current;

      return new Promise<void>((resolve, reject) => {
        let waiter: ReadyWaiter;
        const timeoutId = setTimeout(() => {
          removeWaiter(epoch, waiter);
          reject(new Error(`Document did not become ready within ${timeoutMs}ms`));
        }, timeoutMs);

        waiter = {
          resolve: () => {
            clearTimeout(timeoutId);
            removeWaiter(epoch, waiter);
            resolve();
          },
          reject: (error: Error) => {
            clearTimeout(timeoutId);
            removeWaiter(epoch, waiter);
            reject(error);
          },
        };

        const waiters = waitersRef.current.get(epoch);
        if (!waiters) {
          waitersRef.current.set(epoch, new Set([waiter]));
          return;
        }
        waiters.add(waiter);
      });
    },
    [removeWaiter],
  );

  const notifyEditorReady = useCallback(
    (epoch: number) => {
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
        waiter.resolve();
      }
    },
    [],
  );

  const setDocumentIdSilently = useCallback(
    (id: string) => {
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
        beginEpoch();
        skipNextProviderEpochRef.current = true;
        // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
        setEditorEpoch((value) => value + 1);
      }
    },
    [beginEpoch],
  );

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
    beginEpoch();
    skipNextProviderEpochRef.current = true;
    setEditorEpoch((value) => value + 1);
    resetCollabSession(documentID);
  }, [beginEpoch, documentID]);

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
      }) satisfies DocumentSessionContextValue,
    [
      collabDisabled,
      documentID,
      editorEpoch,
      notifyEditorReady,
      ready,
      reset,
      setId,
      switchEpoch,
      synced,
      whenReady,
      yDoc,
      yjsProvider,
    ],
  );

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
