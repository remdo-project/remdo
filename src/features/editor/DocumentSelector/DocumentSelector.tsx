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
import { createWebsocketProvider } from "../collab/createWebsocketProvider";
import { useEditorConfig } from "../config";
import { NotesState } from "../plugins/remdo/utils/api";
import * as Y from "yjs";

export type DocumentProvider = Provider & WebsocketProvider;

type ProviderFactory = (id: string, yjsDocMap: Map<string, Y.Doc>) => Provider;

export interface DocumentSelectorType {
  documentID: string;
  setDocumentID: (id: string) => void;
  yjsProviderFactory: ProviderFactory;
  getYjsDoc: () => Y.Doc | null;
  yjsProvider: DocumentProvider | null;
  getYjsProvider: () => DocumentProvider | null;
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

function getWebsocketEndpoint() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.hostname;
  return `${protocol}://${host}:8080`;
}

export const DocumentSelectorProvider = ({ children }: { children: ReactNode }) => {
  const [searchParams] = useSearchParams();
  const [documentID, setDocumentID] = useState(searchParams.get("documentID") ?? "main");
  const editorConfig = useEditorConfig();
  const yjsDocs = useRef(new Map<string, Y.Doc>());
  const yjsProviderRef = useRef<DocumentProvider | null>(null);
  const [currentProvider, setCurrentProvider] = useState<DocumentProvider | null>(null);

  const getYjsDoc = useCallback(() => {
    return yjsDocs.current.get(documentID) ?? null;
  }, [documentID]);

  const getYjsProvider = useCallback(() => yjsProviderRef.current, []);

  const yjsProviderFactory: ProviderFactory = useCallback((id: string, yjsDocMap: Map<string, Y.Doc>) => {
    const existingDoc = yjsDocs.current.get(id);
    const doc = existingDoc ?? new Y.Doc({ gc: false });
    yjsDocs.current.set(id, doc);
    yjsDocMap.set(id, doc);

    // Ensure the shared root exists before Lexical binds to the document.
    doc.get("root", Y.XmlText);

    const provider = createWebsocketProvider({
      id,
      doc,
      endpoint: getWebsocketEndpoint(),
      roomPrefix: "notes/0/",
    });

    yjsProviderRef.current = provider;
    setCurrentProvider(provider);

    const handleDestroy = () => {
      if (yjsDocs.current.get(id) === doc) {
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
  }, []);

  const contextValue = useMemo(
    () => ({
      documentID,
      setDocumentID,
      yjsProviderFactory,
      getYjsDoc,
      yjsProvider: currentProvider,
      getYjsProvider,
    }),
    [currentProvider, documentID, getYjsDoc, getYjsProvider, yjsProviderFactory],
  );

  useEffect(() => {
    if (!editorConfig.disableWS) {
      return;
    }
    yjsDocs.current.clear();
    yjsProviderRef.current = null;
    setCurrentProvider(null);
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
