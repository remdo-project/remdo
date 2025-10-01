import { WebsocketProvider } from "y-websocket";

import type { DocumentProvider, DocumentProviderFactory } from "./types";

export interface CreateCollaborationProviderFactoryOptions {
  endpoint?: string;
  roomPrefix?: string;
  connect?: boolean;
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
}: CreateCollaborationProviderFactoryOptions = {}): DocumentProviderFactory {
  return (doc, room) => {
    const roomName = `${roomPrefix}${room}`;
    const provider = new WebsocketProvider(endpoint, roomName, doc, {
      connect,
    });

    provider.shouldConnect = connect;

    return provider as unknown as DocumentProvider;
  };
}
