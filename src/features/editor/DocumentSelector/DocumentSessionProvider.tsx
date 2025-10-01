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
  /** @internal: called by collab plugin after initial Lexical apply */
  _notifyEditorReady: (epoch: number) => void;
};

const DocumentSessionContext = createContext<DocumentSessionInternal | null>(null);

type ReadyWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

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
  const switchEpochRef = useRef(0);
  const readyEpochRef = useRef(-1);
  const waitersRef = useRef(new Map<number, Set<ReadyWaiter>>());

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

  const cancelWaiters = useCallback((error: Error) => {
    const pending = Array.from(waitersRef.current.values()).flatMap((set) => Array.from(set));
    waitersRef.current.clear();
    for (const waiter of pending) {
      waiter.reject(error);
    }
  }, []);

  const beginNewEpoch = useCallback(() => {
    readyEpochRef.current = -1;
    setReady(false);
    setSwitchEpoch((value) => {
      const next = value + 1;
      switchEpochRef.current = next;
      return next;
    });
    cancelWaiters(new Error("Document session changed before becoming ready."));
  }, [cancelWaiters]);

  const whenReady = useCallback<NonNullable<DocumentSession["whenReady"]>>(
    (opts) => {
      const since = opts?.since ?? -1;
      const timeout = opts?.timeout ?? 3000;

      if (ready && readyEpochRef.current > since) {
        return Promise.resolve();
      }

      const epoch = switchEpochRef.current;

      return new Promise<void>((resolve, reject) => {
        const existing = waitersRef.current.get(epoch);
        const waiters = existing ?? new Set<ReadyWaiter>();
        if (!existing) {
          waitersRef.current.set(epoch, waiters);
        }

        let settled = false;
        let waiter: ReadyWaiter;

        const cleanup = () => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(waiter.timeoutId);
          waiters.delete(waiter);
          if (waiters.size === 0) {
            waitersRef.current.delete(epoch);
          }
        };

        waiter = {
          resolve: () => {
            cleanup();
            resolve();
          },
          reject: (error) => {
            cleanup();
            reject(error);
          },
          timeoutId: setTimeout(() => {
            cleanup();
            reject(new Error(`Timed out after ${timeout}ms waiting for document readiness.`));
          }, timeout),
        } satisfies ReadyWaiter;

        waiters.add(waiter);
      });
    },
    [ready],
  );

  const notifyEditorReady = useCallback<DocumentSessionInternal["_notifyEditorReady"]>(
    (epoch) => {
      if (epoch !== switchEpochRef.current) {
        return;
      }
      if (ready && readyEpochRef.current === epoch) {
        return;
      }
      readyEpochRef.current = epoch;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      setReady(true);
      resolveWaitersForEpoch(epoch);
    },
    [ready, resolveWaitersForEpoch],
  );

  useEffect(() => {
    switchEpochRef.current = switchEpoch;
  }, [switchEpoch]);

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
    setEditorEpoch((value) => value + 1);
    beginNewEpoch();
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

  useEffect(() => {
    if (!collabDisabled) {
      return;
    }
    notifyEditorReady(switchEpochRef.current);
  }, [collabDisabled, notifyEditorReady, switchEpoch]);

  return (
    <CollabFactoryContext value={providerFactory}>
      <DocumentSessionContext value={contextValue}>{children}</DocumentSessionContext>
    </CollabFactoryContext>
  );
};
