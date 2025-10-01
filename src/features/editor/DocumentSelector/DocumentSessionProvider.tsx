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

export const DocumentSelectorProvider = ({ children }: { children: ReactNode }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [documentID, setDocumentIdState] = useState(() => searchParams.get("documentID") ?? "main");
  const [editorEpoch, setEditorEpoch] = useState(0);
  const collabDisabled = useCollaborationDisabled();
  const [switchEpoch, setSwitchEpochState] = useState(0);
  const [readyState, setReadyState] = useState(false);
  const switchEpochRef = useRef(switchEpoch);
  const readyRef = useRef(readyState);
  const readyEpochRef = useRef(-1);
  const waitersRef = useRef(new Map<number, Set<ReadyWaiter>>());
  const { yDoc, yjsProvider, synced } = useCollabSession(documentID);
  const lastSearchParamIdRef = useRef<string | null>(searchParams.get("documentID"));
  const skipNextProviderEpochRef = useRef(true);

  useEffect(() => {
    switchEpochRef.current = switchEpoch;
  }, [switchEpoch]);

  useEffect(() => {
    readyRef.current = readyState;
  }, [readyState]);

  const resolveWaiters = useCallback((epoch: number) => {
    const waiters = waitersRef.current.get(epoch);
    if (!waiters) {
      return;
    }
    waitersRef.current.delete(epoch);
    for (const waiter of waiters) {
      waiter.resolve();
    }
  }, []);

  const rejectWaiters = useCallback((error: Error) => {
    const entries = Array.from(waitersRef.current.entries());
    waitersRef.current.clear();
    for (const [, waiters] of entries) {
      for (const waiter of waiters) {
        waiter.reject(error);
      }
    }
  }, []);

  const beginNewEpoch = useCallback(() => {
    setReadyState(false);
    readyRef.current = false;
    readyEpochRef.current = -1;
    rejectWaiters(new Error("Document switched before ready"));
    setSwitchEpochState((previous) => {
      const next = previous + 1;
      switchEpochRef.current = next;
      return next;
    });
  }, [rejectWaiters]);

  const whenReady = useCallback(
    (opts?: { since?: number; timeout?: number }) => {
      const { since = -1, timeout = 3000 } = opts ?? {};
      if (readyRef.current && readyEpochRef.current > since) {
        return Promise.resolve();
      }

      const epoch = switchEpochRef.current;
      return new Promise<void>((resolve, reject) => {
        const existing = waitersRef.current.get(epoch);
        const waiters = existing ?? new Set<ReadyWaiter>();
        if (!existing) {
          waitersRef.current.set(epoch, waiters);
        }

        let timeoutId: ReturnType<typeof setTimeout>;
        let entry: ReadyWaiter;

        function cleanup() {
          clearTimeout(timeoutId);
          const current = waitersRef.current.get(epoch);
          if (current) {
            current.delete(entry);
            if (current.size === 0) {
              waitersRef.current.delete(epoch);
            }
          } else {
            waiters.delete(entry);
          }
        }

        entry = {
          resolve: () => {
            cleanup();
            resolve();
          },
          reject: (error: Error) => {
            cleanup();
            reject(error);
          },
        };

        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error(`Document did not become ready within ${timeout}ms`));
        }, timeout);

        waiters.add(entry);
      });
    },
    [],
  );

  const notifyEditorReady = useCallback(
    (epoch: number) => {
      if (epoch !== switchEpochRef.current) {
        return;
      }
      readyEpochRef.current = epoch;
      readyRef.current = true;
      setReadyState(true);
      resolveWaiters(epoch);
    },
    [resolveWaiters],
  );

  useEffect(() => {
    if (!collabDisabled) {
      return;
    }
    readyEpochRef.current = switchEpochRef.current;
    readyRef.current = true;
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setReadyState(true);
    resolveWaiters(switchEpochRef.current);
  }, [collabDisabled, resolveWaiters]);

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
    skipNextProviderEpochRef.current = true;
    beginNewEpoch();
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
        ready: readyState,
        switchEpoch,
        whenReady,
        _notifyEditorReady: notifyEditorReady,
      }) satisfies DocumentSessionContextValue,
    [
      collabDisabled,
      documentID,
      editorEpoch,
      notifyEditorReady,
      readyState,
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
