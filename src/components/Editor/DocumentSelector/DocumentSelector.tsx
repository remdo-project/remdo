import { NotesState } from "../plugins/remdo/utils/api";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { Provider } from "@lexical/yjs";
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dropdown, NavDropdown } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { useEditorConfig } from "../config";

//import conditionally, because it breaks unit tests, where indexedDB is
//neither available nor used
const yIDB = "indexedDB" in window ? import("y-indexeddb") : null;

type ProviderFactory = (id: string, yjsDocMap: Map<string, Y.Doc>) => Provider;
interface DocumentSelectorType {
  documentID: string;
  setDocumentID: (id: string) => void;
  yjsProviderFactory: ProviderFactory;
  getYjsDoc: () => Y.Doc | null;
  yjsProvider: WebsocketProvider | null;
}

const DocumentSelectorContext = createContext<DocumentSelectorType>(null);

export const useDocumentSelector = () => {
  const context = useContext(DocumentSelectorContext);
  if (!context) {
    throw new Error(
      "useDocumentSelector must be used within a DocumentSelectorProvider"
    );
  }
  return context;
};

export const DocumentSelectorProvider = ({ children }) => {
  const [searchParams] = useSearchParams();
  const [documentID, setDocumentID] = useState(searchParams.get("documentID") ?? "main");
  const yjsDoc = useRef<Y.Doc | null>(null);
  //FIXME remove the duplication
  const yjsProvider = useRef<Provider | null>(null);
  const [currentProvider, setCurrentProvider] = useState<Provider | null>(null);
  const editorConfig = useEditorConfig();

  const yjsProviderFactory: ProviderFactory = useMemo((): ProviderFactory => {
    const factory: ProviderFactory = (
      id: string,
      yjsDocMap: Map<string, Y.Doc>
    ): Provider => {
      let doc = yjsDocMap.get(id);

      if (doc) {
        doc.load();
      } else {
        doc = new Y.Doc();
        yjsDocMap.set(id, doc);
      }
      yjsDoc.current = doc;

      if (yIDB) {
        yIDB.then(({ IndexeddbPersistence }) => {
          const idbProvider = new IndexeddbPersistence(id, doc);
          yjsProvider.current = idbProvider;
          setCurrentProvider(idbProvider);
        });
      } else if (!("__vitest_environment__" in globalThis)) {
        console.warn(
          "IndexedDB is not supported in this browser. Disabling offline mode."
        );
      }

      if (!editorConfig.disableWS) {
        const wsURL = `ws://${window.location.hostname}:8080`;
        const roomName = "notes/0/" + id;
        const wsProvider = new WebsocketProvider(wsURL, roomName, doc, {
          connect: true,
        });
        wsProvider.shouldConnect = true; // reconnect after disconnecting

        /*
        const events = ["status", "synced", "sync", "update", "error", "destroy", "reload"];
        events.forEach((event) => {
          wsProvider.on(event, () => {
            console.log("wsProvider", event);
          });
        });
        */

        //TODO remove duplicated provider
        // @ts-ignore
        yjsProvider.current = wsProvider;
        setCurrentProvider(wsProvider);
      }
      return yjsProvider.current;
    };
    return factory;
  }, []);

  const hocuspocusProviderFactory: ProviderFactory =
    useMemo((): ProviderFactory => {
      const factory: ProviderFactory = (
        id: string,
        yjsDocMap: Map<string, Y.Doc>
      ): Provider => {
        const wsURL = `ws://${window.location.hostname}:8080`;
        const roomName = "notes/0/" + id;
        const provider = new HocuspocusProvider({ url: wsURL, name: roomName });

        yjsProvider.current = provider;
        yjsDocMap.set(id, provider.document);
        yjsDoc.current = provider.document;
        return provider;
      };
      return factory;
    }, []);

  return (
    <DocumentSelectorContext.Provider
      value={{
        documentID,
        setDocumentID,
        yjsProviderFactory,
        //yjsProviderFactory: hocuspocusProviderFactory, //currently doesn't support persistance, even between page reloads
        //TODO make it a property, same as provider
        getYjsDoc: () => yjsDoc.current,
        yjsProvider: currentProvider,
      }}
    >
      {children}
    </DocumentSelectorContext.Provider>
  );
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
