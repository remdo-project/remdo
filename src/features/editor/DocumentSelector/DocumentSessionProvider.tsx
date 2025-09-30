import type { Provider } from "@lexical/yjs";
import type { WebsocketProvider } from "y-websocket";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
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

type ProviderFactory = (id: string, yjsDocMap: Map<string, Y.Doc>) => Provider;

export interface DocumentSelectorType {
  documentID: string;
  selectDocument: (id: string, opts?: { replace?: boolean; path?: string }) => void;
  setDocumentIdSilently: (id: string) => void;
  /** @deprecated Use selectDocument or setDocumentIdSilently */
  setDocumentID: (id: string) => void;
  yjsProviderFactory: ProviderFactory;
  getYjsDoc: () => Y.Doc | null;
  yjsProvider: DocumentProvider | null;
  getYjsProvider: () => DocumentProvider | null;
  resetDocument: () => void;
  version: number;
  synced: boolean;
}

const DocumentSelectorContext = createContext<DocumentSelectorType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useDocumentSelector = () => {
  const context = use(DocumentSelectorContext);
  if (!context) {
    throw new Error("useDocumentSelector must be used within a DocumentSelectorProvider");
  }
  return context;
};

export const DocumentSelectorProvider = ({ children }: { children: ReactNode }) => {
  type SetURLSearchParams = ReturnType<typeof useSearchParams>[1];

  let searchParamsTuple: [URLSearchParams, SetURLSearchParams] | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    searchParamsTuple = useSearchParams();
  } catch {
    searchParamsTuple = null;
  }

  const hasSearchParams = searchParamsTuple !== null;
  const [searchParams, setSearchParams] =
    searchParamsTuple ??
    [new URLSearchParams(), (() => {}) as SetURLSearchParams];

  let navigateFn: ReturnType<typeof useNavigate>;
  let hasNavigate = true;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    navigateFn = useNavigate();
  } catch {
    hasNavigate = false;
    navigateFn = ((() => undefined) as unknown) as ReturnType<typeof useNavigate>;
  }

  const [documentID, setDocumentIDState] = useState(
    () => searchParams.get("documentID") ?? "main",
  );
  const editorConfig = useEditorConfig();
  const yjsDocs = useRef(new Map<string, Y.Doc>());
  const yjsProviderRef = useRef<DocumentProvider | null>(null);
  const [currentProvider, setCurrentProvider] = useState<DocumentProvider | null>(null);
  const [version, setVersion] = useState(0);
  const [synced, setSynced] = useState(false);
  const lastSearchParamIdRef = useRef<string | null>(searchParams.get("documentID"));

  const setDocumentIdSilently = useCallback((id: string) => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setDocumentIDState((prev) => (prev === id ? prev : id));
  }, []);

  const selectDocument = useCallback(
    (id: string, opts?: { replace?: boolean; path?: string }) => {
      if (documentID === id) {
        return;
      }

      setDocumentIdSilently(id);

      if (hasSearchParams) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("documentID", id);
        setSearchParams(nextParams, opts?.replace ? { replace: true } : undefined);
      }

      if (hasNavigate) {
        const path = opts?.path ?? "/";
        navigateFn(path, opts?.replace ? { replace: true } : undefined);
      }
    },
    [
      documentID,
      hasNavigate,
      hasSearchParams,
      navigateFn,
      searchParams,
      setDocumentIdSilently,
      setSearchParams,
    ],
  );

  const setDocumentID = useCallback(
    (id: string) => {
      selectDocument(id, { replace: true });
    },
    [selectDocument],
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

  const getYjsDoc = useCallback(() => {
    return yjsDocs.current.get(documentID) ?? null;
  }, [documentID]);

  const getYjsProvider = useCallback(() => yjsProviderRef.current, []);

  const yjsProviderFactory: ProviderFactory = useCallback(
    (id: string, yjsDocMap: Map<string, Y.Doc>) => {
      const provider = baseProviderFactory(id, yjsDocMap) as DocumentProvider;
      const doc = yjsDocMap.get(id);

      if (doc) {
        yjsDocs.current.set(id, doc);
      }

      yjsProviderRef.current = provider;
      setCurrentProvider(provider);

      const handleDestroy = () => {
        if (doc && yjsDocs.current.get(id) === doc) {
          yjsDocs.current.delete(id);
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
    [baseProviderFactory],
  );

  const resetDocument = useCallback(() => {
    const provider = yjsProviderRef.current;
    if (provider) {
      provider.destroy();
    } else {
      yjsDocs.current.delete(documentID);
    }
    setVersion((prev) => prev + 1);
  }, [documentID]);

  const contextValue = useMemo(
    () => ({
      documentID,
      selectDocument,
      setDocumentIdSilently,
      setDocumentID,
      yjsProviderFactory,
      getYjsDoc,
      yjsProvider: currentProvider,
      getYjsProvider,
      resetDocument,
      version,
      synced,
    }),
    [
      currentProvider,
      documentID,
      getYjsDoc,
      getYjsProvider,
      resetDocument,
      selectDocument,
      setDocumentID,
      setDocumentIdSilently,
      synced,
      version,
      yjsProviderFactory,
    ],
  );

  useEffect(() => {
    if (!hasSearchParams) {
      return;
    }

    const nextSearchParamId = searchParams.get("documentID");
    if (lastSearchParamIdRef.current === nextSearchParamId) {
      return;
    }

    lastSearchParamIdRef.current = nextSearchParamId;
    const normalizedId = nextSearchParamId ?? "main";
    setDocumentIdSilently(normalizedId);
  }, [hasSearchParams, searchParams, setDocumentIdSilently]);

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
  }, [editorConfig.disableWS]);

  return <DocumentSelectorContext value={contextValue}>{children}</DocumentSelectorContext>;
};
