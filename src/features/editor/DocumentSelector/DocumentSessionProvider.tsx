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

type DocumentSessionInternal = DocumentSession & {
  /** @internal */
  _notifyEditorReady: (epoch: number) => void;
};

type ReadyWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

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
  const [switchEpoch, setSwitchEpoch] = useState(0);
  const [ready, setReady] = useState(false);
  const collabDisabled = useCollaborationDisabled();
  const { yDoc, yjsProvider, synced } = useCollabSession(documentID);
  const lastSearchParamIdRef = useRef<string | null>(searchParams.get("documentID"));
  const skipNextProviderEpochRef = useRef(true);
  const readyEpochRef = useRef(-1);
  const waitersRef = useRef(new Map<number, Set<ReadyWaiter>>());

  const rejectWaitersBefore = useCallback((epoch: number, reason: Error) => {
    waitersRef.current.forEach((waiters, waiterEpoch) => {
      if (waiterEpoch < epoch) {
        waitersRef.current.delete(waiterEpoch);
        for (const waiter of Array.from(waiters)) {
          waiter.reject(reason);
        }
      }
    });
  }, []);

  const resolveWaitersForEpoch = useCallback((epoch: number) => {
    const waiters = waitersRef.current.get(epoch);
    if (!waiters) {
      return;
    }
    waitersRef.current.delete(epoch);
    for (const waiter of Array.from(waiters)) {
      waiter.resolve();
    }
  }, []);

  useEffect(() => () => {
    rejectWaitersBefore(Number.POSITIVE_INFINITY, new Error("Document session disposed"));
    waitersRef.current.clear();
  }, [rejectWaitersBefore]);

  const beginNewEpoch = useCallback(() => {
    setReady(false);
    setSwitchEpoch((prev) => {
      const next = prev + 1;
      rejectWaitersBefore(next, new Error("Document switched before ready"));
      return next;
    });
  }, [rejectWaitersBefore]);

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
      skipNextProviderEpochRef.current = true;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      setEditorEpoch((value) => value + 1);
      beginNewEpoch();
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
    setEditorEpoch((value) => value + 1);
    resetCollabSession(documentID);
    beginNewEpoch();
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

  const whenReady = useCallback(
    (opts?: { since?: number; timeout?: number }) => {
      const since = opts?.since ?? -1;
      const timeout = opts?.timeout ?? 3000;
      if (collabDisabled) {
        return Promise.resolve();
      }
      if (ready && readyEpochRef.current > since) {
        return Promise.resolve();
      }

      const currentEpoch = switchEpoch;
      return new Promise<void>((resolve, reject) => {
        const bucket = waitersRef.current.get(currentEpoch) ?? new Set<ReadyWaiter>();
        if (!waitersRef.current.has(currentEpoch)) {
          waitersRef.current.set(currentEpoch, bucket);
        }

        const waiter: ReadyWaiter = {
          resolve: () => {
            bucket.delete(waiter);
            if (bucket.size === 0) {
              waitersRef.current.delete(currentEpoch);
            }
            clearTimeout(waiter.timeoutId);
            resolve();
          },
          reject: (error: Error) => {
            bucket.delete(waiter);
            if (bucket.size === 0) {
              waitersRef.current.delete(currentEpoch);
            }
            clearTimeout(waiter.timeoutId);
            reject(error);
          },
          timeoutId: setTimeout(() => {
            waiter.reject(new Error(`Document readiness timed out after ${timeout}ms`));
          }, timeout),
        };

        bucket.add(waiter);
      });
    },
    [collabDisabled, ready, switchEpoch],
  );

  useEffect(() => {
    if (!collabDisabled || ready) {
      return;
    }

    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setReady(true);
    readyEpochRef.current = switchEpoch;
    resolveWaitersForEpoch(switchEpoch);
  }, [collabDisabled, ready, resolveWaitersForEpoch, switchEpoch]);

  useEffect(() => {
    if (!collabDisabled && !synced && ready) {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      setReady(false);
    }
  }, [collabDisabled, ready, synced]);

  const notifyEditorReady = useCallback(
    (epoch: number) => {
      if (epoch !== switchEpoch) {
        return;
      }
      setReady(true);
      readyEpochRef.current = epoch;
      resolveWaitersForEpoch(epoch);
    },
    [resolveWaitersForEpoch, switchEpoch],
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
