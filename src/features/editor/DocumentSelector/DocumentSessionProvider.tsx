/* eslint-disable react-refresh/only-export-components, react/no-use-context */
import type { Provider } from "@lexical/yjs";
import type { WebsocketProvider } from "y-websocket";
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
import { useEditorConfig } from "../config";
import * as Y from "yjs";
import {
  createCollaborationProviderFactory,
  getCollaborationEndpoint,
} from "../collab/createCollaborationProviderFactory";

type YWebsocketEvents = {
  synced: (synced: boolean) => void;
  destroy: () => void;
};

type TypedProvider = WebsocketProvider & {
  on<K extends keyof YWebsocketEvents>(event: K, callback: YWebsocketEvents[K]): void;
  off<K extends keyof YWebsocketEvents>(event: K, callback: YWebsocketEvents[K]): void;
};

export type DocumentProvider = Provider & TypedProvider;

export type ProviderFactory = (id: string, yjsDocMap: Map<string, Y.Doc>) => Provider;

export type DocumentSession = {
  id: string;
  setId: (id: string, mode?: "push" | "replace" | "silent") => void;
  provider: DocumentProvider | null;
  doc: Y.Doc | null;
  reset: () => void;
  synced: boolean;
};

const DocumentSessionContext = createContext<DocumentSession | null>(null);
export const CollabFactoryContext = createContext<ProviderFactory | null>(null);
const legacySessionRef: { current: DocumentSession | null } = { current: null };

function makeSearchWithDoc(id: string, current: URLSearchParams) {
  const next = new URLSearchParams(current);
  next.set("documentID", id);
  return `?${next.toString()}`;
}

export const useDocumentSelector = () => {
  const context = useContext(DocumentSessionContext);
  if (!context) {
    throw new Error("useDocumentSelector must be used within a DocumentSelectorProvider");
  }
  return context;
};

export const DocumentSelectorProvider = ({ children }: { children: ReactNode }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [documentID, setDocumentIDState] = useState(
    () => searchParams.get("documentID") ?? "main",
  );
  const editorConfig = useEditorConfig();
  const yjsDocs = useRef(new Map<string, Y.Doc>());
  const yjsProviderRef = useRef<DocumentProvider | null>(null);
  const isMountedRef = useRef(true);
  const [currentProvider, setCurrentProvider] = useState<DocumentProvider | null>(null);
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [synced, setSynced] = useState(false);
  const lastSearchParamIdRef = useRef<string | null>(searchParams.get("documentID"));
  const [resetToken, setResetToken] = useState(0);

  const scheduleSetDoc = useCallback((next: Y.Doc | null) => {
    if (!isMountedRef.current) {
      return;
    }
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setDoc((prev) => (prev === next ? prev : next));
  }, []);

  const setDocumentIdSilently = useCallback((id: string) => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setDocumentIDState((prev) => (prev === id ? prev : id));
    scheduleSetDoc(yjsDocs.current.get(id) ?? null);
  }, [scheduleSetDoc]);

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
        // Let Lexical's CollaborationPlugin attach listeners before the provider connects,
        // mirroring the working setup used by LexicalDemo.
        createDoc: () => {
          const doc = new Y.Doc({ gc: false });
          // Mirror Lexical's Playground initialization by creating the shared root
          // type eagerly before the document is handed to Lexical. This prevents
          // `syncLexicalUpdateToYjs` from reading a detached Yjs type when the
          // first editor update runs for a brand-new document.
          doc.get("root", Y.XmlText);
          return doc;
        },
        initializeDoc: (doc) => {
          // Persisted docs created before we eagerly instantiated the root may
          // be missing it. Create the shared type on-demand so old docs behave
          // like freshly initialized ones.
          if (!doc.share.has("root")) {
            doc.get("root", Y.XmlText);
          }
        },
      }),
    [],
  );

  const yjsProviderFactory: ProviderFactory = useCallback(
    (id: string, yjsDocMap: Map<string, Y.Doc>) => {
      const storedDoc = yjsDocs.current.get(id) ?? null;
      if (storedDoc && !yjsDocMap.has(id)) {
        yjsDocMap.set(id, storedDoc);
      }
      const provider = baseProviderFactory(id, yjsDocMap) as DocumentProvider;
      const previousDoc = yjsDocs.current.get(id) ?? null;
      const nextDoc = yjsDocMap.get(id) ?? null;

      if (nextDoc) {
        yjsDocs.current.set(id, nextDoc);
      } else {
        yjsDocs.current.delete(id);
      }
      if (id === documentID && previousDoc !== nextDoc) {
        scheduleSetDoc(nextDoc);
      }

      yjsProviderRef.current = provider;
      setCurrentProvider(provider);

      const handleDestroy = () => {
        const storedDoc = yjsDocs.current.get(id) ?? null;
        if (storedDoc && storedDoc === nextDoc) {
          yjsDocs.current.delete(id);
          if (id === documentID) {
            scheduleSetDoc(null);
          }
        }
        if (yjsProviderRef.current === provider) {
          yjsProviderRef.current = null;
        }
        setCurrentProvider((prev) => (prev === provider ? null : prev));
        provider.off("destroy", handleDestroy);
      };

      provider.on("destroy", handleDestroy);

      return provider;
    },
    [baseProviderFactory, documentID, scheduleSetDoc],
  );

  const reset = useCallback(() => {
    const provider = yjsProviderRef.current;
    if (provider) {
      provider.destroy();
    } else {
      yjsDocs.current.delete(documentID);
    }
    scheduleSetDoc(null);
    setResetToken((prev) => prev + 1);
  }, [documentID, scheduleSetDoc]);

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
    () => {
      void resetToken;
      return {
        id: documentID,
        setId,
        provider: currentProvider,
        doc,
        reset,
        synced,
      } satisfies DocumentSession;
    },
    [currentProvider, doc, documentID, reset, setId, synced, resetToken],
  );

  useEffect(() => {
    legacySessionRef.current = contextValue;
    return () => {
      if (legacySessionRef.current === contextValue) {
        legacySessionRef.current = null;
      }
    };
  }, [contextValue]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
    if (!currentProvider) {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      setSynced(false);
      return;
    }

    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setSynced(Boolean(currentProvider.synced));
    currentProvider.on("synced", setSynced);
    return () => {
      currentProvider.off("synced", setSynced);
    };
  }, [currentProvider]);

  useEffect(() => {
    if (!editorConfig.disableWS) {
      return;
    }

    const provider = yjsProviderRef.current;
    if (provider) {
      provider.destroy();
    }

    yjsDocs.current.clear();
    yjsProviderRef.current = null;
    scheduleSetDoc(null);
  }, [editorConfig.disableWS, scheduleSetDoc]);

  return (
    <CollabFactoryContext value={yjsProviderFactory}>
      <DocumentSessionContext value={contextValue}>{children}</DocumentSessionContext>
    </CollabFactoryContext>
  );
};

/** @deprecated Use session.provider instead */
export const getYjsProvider = () => legacySessionRef.current?.provider ?? null;

/** @deprecated Use session.doc instead */
export const getYjsDoc = () => legacySessionRef.current?.doc ?? null;

/** @deprecated Use useCollabFactory() */
export const yjsProviderFactory = undefined as unknown as ProviderFactory;

/** @deprecated Use session.setId(id, 'replace' | 'push' | 'silent') */
export const setDocumentID = (id: string) => {
  legacySessionRef.current?.setId(id, "replace");
};

/** @deprecated Internal; no external usage */
export const version = undefined as unknown as number;
