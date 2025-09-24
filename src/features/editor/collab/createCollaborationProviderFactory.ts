import type { Provider } from "@lexical/yjs";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

export type CollaborationProviderFactory = (
  id: string,
  yjsDocMap: Map<string, Y.Doc>,
) => Provider;

export interface CreateCollaborationProviderFactoryOptions {
  endpoint?: string;
  roomPrefix?: string;
  connect?: boolean;
  createDoc?: () => Y.Doc;
  initializeDoc?: (doc: Y.Doc, id: string, isNew: boolean) => void;
}

export function getCollaborationEndpoint(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:8080";
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.hostname;

  return `${protocol}://${host}:8080`;
}

export function createCollaborationProviderFactory({
  endpoint = getCollaborationEndpoint(),
  roomPrefix = "remdo/0/",
  connect = false,
  createDoc = () => new Y.Doc(),
  initializeDoc,
}: CreateCollaborationProviderFactoryOptions = {}): CollaborationProviderFactory {
  return (id, yjsDocMap) => {
    let doc = yjsDocMap.get(id);
    let isNewDoc = false;

    if (!doc) {
      doc = createDoc();
      yjsDocMap.set(id, doc);
      isNewDoc = true;
    } else {
      doc.load();
    }

    initializeDoc?.(doc, id, isNewDoc);

    const roomName = `${roomPrefix}${id}`;
    const provider = new WebsocketProvider(endpoint, roomName, doc, {
      connect,
    });

    provider.shouldConnect = connect;

    return provider as unknown as Provider;
  };
}
