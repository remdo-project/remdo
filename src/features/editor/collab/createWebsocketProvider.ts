import type { Provider } from "@lexical/yjs";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

export interface CreateWebsocketProviderOptions {
  id: string;
  doc: Y.Doc;
  endpoint: string;
  roomPrefix?: string;
}

export function createWebsocketProvider({
  id,
  doc,
  endpoint,
  roomPrefix = "",
}: CreateWebsocketProviderOptions): Provider & WebsocketProvider {
  const roomName = `${roomPrefix}${id}`;
  const provider = new WebsocketProvider(endpoint, roomName, doc, {
    connect: true,
  });
  provider.shouldConnect = true;
  return provider as unknown as Provider & WebsocketProvider;
}
