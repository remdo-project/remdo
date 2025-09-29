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
import { Dropdown, NavDropdown } from "react-bootstrap";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEditorConfig } from "../config";
import { NotesState } from "../plugins/remdo/utils/api";
import * as Y from "yjs";
import {
  createCollaborationProviderFactory,
  getCollaborationEndpoint,
} from "../collab/createCollaborationProviderFactory";

export type DocumentProvider = Provider & WebsocketProvider;

type ProviderFactory = (id: string, yjsDocMap: Map<string, Y.Doc>) => Provider;

export interface DocumentSelectorType {
  documentID: string;
  setDocumentID: (id: string) => void;
  yjsProviderFactory: ProviderFactory;
  getYjsDoc: () => Y.Doc | null;
  yjsProvider: DocumentProvider | null;
  getYjsProvider: () => DocumentProvider | null;
  resetDocument: () => void;
  ready: () => Promise<void>;
  version: number;
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
  const [searchParams] = useSearchParams();
  const [documentID, setDocumentID] = useState(searchParams.get("documentID") ?? "main");
  const editorConfig = useEditorConfig();
  const yjsDocs = useRef(new Map<string, Y.Doc>());
  const yjsProviderRef = useRef<DocumentProvider | null>(null);
  const [currentProvider, setCurrentProvider] = useState<DocumentProvider | null>(null);
  const [version, setVersion] = useState(0);
  const readyStateRef = useRef<{
    documentID: string;
    deferred: { promise: Promise<void>; resolve: () => void };
  } | null>(null);

  const ensureReadyState = useCallback((id: string) => {
    const current = readyStateRef.current;
    if (current?.documentID === id) {
      return current.deferred;
    }

    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
      resolve = res;
    });

    const deferred = { promise, resolve };
    readyStateRef.current = { documentID: id, deferred };
    return deferred;
  }, []);

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
      ensureReadyState(id);

      if (doc) {
        if (!doc.share.has("root")) {
          doc.get("root", Y.XmlText);
        }
        yjsDocs.current.set(id, doc);
      }

      yjsProviderRef.current = provider;
      setCurrentProvider(provider);

      const resolveReady = () => {
        const current = readyStateRef.current;
        if (current?.documentID !== id) {
          return;
        }

        const readyDoc = yjsDocs.current.get(id);
        if (!readyDoc) {
          return;
        }

        if (!readyDoc.share.has("root")) {
          readyDoc.get("root", Y.XmlText);
        }

        current.deferred.resolve();
      };

      const handleSync = (isSynced: boolean) => {
        if (!isSynced) {
          return;
        }
        resolveReady();
      };

      const handleDestroy = () => {
        if (doc && yjsDocs.current.get(id) === doc) {
          yjsDocs.current.delete(id);
        }
        if (yjsProviderRef.current === provider) {
          yjsProviderRef.current = null;
        }
        setCurrentProvider((prev) => (prev === provider ? null : prev));
        if (readyStateRef.current?.documentID === id) {
          readyStateRef.current = null;
        }
        // @ts-expect-error The Y-Websocket provider emits a "sync" event even though it's not part of
        // the typed event map.
        provider.off("sync", handleSync);
        // @ts-expect-error The Y-Websocket provider emits a "destroy" event even though it's
        // not part of the typed event map.
        provider.off("destroy", handleDestroy);
      };

      // @ts-expect-error The Y-Websocket provider emits a "sync" event even though it's not part of
      // the typed event map.
      provider.on("sync", handleSync);
      // @ts-expect-error The Y-Websocket provider emits a "destroy" event even though it's not
      // part of the typed event map.
      provider.on("destroy", handleDestroy);

      if (provider.synced) {
        resolveReady();
      }

      return provider;
    },
    [baseProviderFactory, ensureReadyState],
  );

  const resetDocument = useCallback(() => {
    const pendingReady = readyStateRef.current;
    const provider = yjsProviderRef.current;
    if (provider) {
      provider.destroy();
    } else {
      yjsDocs.current.delete(documentID);
    }
    if (pendingReady?.documentID === documentID) {
      pendingReady.deferred.resolve();
    }
    if (readyStateRef.current?.documentID === documentID) {
      readyStateRef.current = null;
    }
    setVersion((prev) => prev + 1);
  }, [documentID]);

  const ready = useCallback(() => {
    if (editorConfig.disableWS) {
      return Promise.resolve();
    }
    return ensureReadyState(documentID).promise;
  }, [documentID, editorConfig.disableWS, ensureReadyState]);

  const contextValue = useMemo(
    () => ({
      documentID,
      setDocumentID,
      yjsProviderFactory,
      getYjsDoc,
      yjsProvider: currentProvider,
      getYjsProvider,
      resetDocument,
      ready,
      version,
    }),
    [
      currentProvider,
      documentID,
      ready,
      getYjsDoc,
      getYjsProvider,
      resetDocument,
      version,
      yjsProviderFactory,
    ],
  );

  useEffect(() => {
    if (!editorConfig.disableWS) {
      return;
    }

    const pendingReady = readyStateRef.current;
    const provider = yjsProviderRef.current;
    if (provider) {
      provider.destroy();
    }

    yjsDocs.current.clear();
    yjsProviderRef.current = null;
    if (pendingReady) {
      pendingReady.deferred.resolve();
    }
    readyStateRef.current = null;
  }, [editorConfig.disableWS]);

  return <DocumentSelectorContext value={contextValue}>{children}</DocumentSelectorContext>;
};

export function DocumentSelector() {
  const { setDocumentID } = useDocumentSelector();
  const navigate = useNavigate();

  return (
    <div data-testid="document-selector">
      <NavDropdown title="Documents">
        {NotesState.documents().map((document) => (
          <Dropdown.Item
            href={`?documentID=${document}`}
            key={document}
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
              setDocumentID(document);
            }}
          >
            {document}
          </Dropdown.Item>
        ))}
      </NavDropdown>
    </div>
  );
}
