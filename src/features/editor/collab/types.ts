import type { Provider } from "@lexical/yjs";
import type * as Y from "yjs";

export type YWebsocketEvents = { synced: (synced: boolean) => void; destroy: () => void };

export type DocumentProvider = Provider & {
  on(event: "destroy", callback: YWebsocketEvents["destroy"]): void;
  on(event: "synced", callback: YWebsocketEvents["synced"]): void;
  off(event: "destroy", callback: YWebsocketEvents["destroy"]): void;
  off(event: "synced", callback: YWebsocketEvents["synced"]): void;
  destroy(): void;
  synced?: boolean;
};

export type DocumentProviderFactory = (doc: Y.Doc, room: string) => DocumentProvider;

export type ProviderFactory = (id: string, yjsDocMap: Map<string, Y.Doc>) => DocumentProvider;
