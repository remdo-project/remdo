import { afterAll, beforeAll, expect, it } from "vitest";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import WS from "ws";
import { env } from "../../../config/env.server";

declare global {
  let __collabProviders: WebsocketProvider[] | undefined;
}

function waitForSync(provider: WebsocketProvider): Promise<void> {
  if (provider.synced) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      provider.off?.("sync", onSync);
    };
    function onSync(isSynced: boolean) {
      if (!isSynced) {
        return;
      }
      cleanup();
      resolve();
    }
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error("provider failed to sync"));
    }, 10000);
    provider.on("sync", onSync);
  });
}

const shouldRun = env.FORCE_WEBSOCKET;

if (shouldRun) {
  beforeAll(() => {
    if (typeof WebSocket === "undefined") {
      // @ts-expect-error assigning to global
      globalThis.WebSocket = WS;
    }
    globalThis.__collabProviders = [];
  });

  afterAll(() => {
    for (const provider of globalThis.__collabProviders ?? []) {
      provider.destroy();
    }
    globalThis.__collabProviders = [];
  });
}

function createProvider(room: string, doc: Y.Doc) {
  const provider = new WebsocketProvider("ws://127.0.0.1:8080", room, doc, {
    connect: true,
  });
  globalThis.__collabProviders?.push(provider);
  return provider;
}

it.runIf(shouldRun)("connects to the websocket server", async () => {
  const doc = new Y.Doc();
  const provider = createProvider("vitest-collab", doc);
  await waitForSync(provider);

  expect(provider.wsconnected).toBe(true);
  expect(provider.synced).toBe(true);
}, 15000);
