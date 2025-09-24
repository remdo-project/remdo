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

  const baseProviderFactory = useMemo(
    () =>
      createCollaborationProviderFactory({
        endpoint: getCollaborationEndpoint(),
        roomPrefix: "notes/0/",
        // Let Lexical's CollaborationPlugin attach listeners before the provider connects,
        // mirroring the working setup used by LexicalDemo.
        createDoc: () => new Y.Doc({ gc: false }),
        initializeDoc: (doc, id, isNew) => {
          if (isNew) {
            // Ensure the shared root exists before Lexical binds to the document.
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
      setDocumentID,
      yjsProviderFactory,
      getYjsDoc,
      yjsProvider: currentProvider,
      getYjsProvider,
      resetDocument,
      version,
    }),
    [
      currentProvider,
      documentID,
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

    const provider = yjsProviderRef.current;
    if (provider) {
      provider.destroy();
    }

    yjsDocs.current.clear();
    yjsProviderRef.current = null;
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
