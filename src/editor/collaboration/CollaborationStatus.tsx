import type { Provider } from '@lexical/yjs';
import type { ReactNode } from 'react';
import { env } from '#env-client';
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPlugin as LexicalCollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { createContext, use, useMemo, useState } from 'react';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

/* eslint-disable react-refresh/only-export-components */

type ProviderFactory = (id: string, docMap: Map<string, Y.Doc>) => Provider;

interface CollaborationStatusValue {
  ready: boolean;
  enabled: boolean;
  providerFactory: ProviderFactory;
}

const DEFAULT_ROOM_ID = 'lexical-demo-room2';
const missingContextError = new Error('Collaboration context is missing. Wrap the editor in <CollaborationProvider>.');

const CollaborationStatusContext = createContext<CollaborationStatusValue | null>(null);

export function useCollaborationStatus(): CollaborationStatusValue {
  const value = use(CollaborationStatusContext);

  if (!value) {
    throw missingContextError;
  }

  return value;
}

export function CollaborationProvider({ children }: { children: ReactNode }) {
  const value = useCollaborationRuntimeValue();

  return <CollaborationStatusContext value={value}>{children}</CollaborationStatusContext>;
}

export function CollaborationPlugin() {
  const { enabled, providerFactory } = useCollaborationStatus();

  if (!enabled) {
    return <HistoryPlugin />;
  }

  return (
    <LexicalCollaboration>
      <LexicalCollaborationPlugin id={DEFAULT_ROOM_ID} providerFactory={providerFactory} shouldBootstrap />
    </LexicalCollaboration>
  );
}

function useCollaborationRuntimeValue(): CollaborationStatusValue {
  const enabled = env.collabEnabled;
  const [ready, setReady] = useState(!enabled);
  const endpoint = useMemo(resolveDefaultEndpoint, []);

  const providerFactory = useMemo(
    () =>
      createProviderFactory(
        setReady,
        endpoint,
      ),
    [endpoint, setReady]
  );

  return useMemo<CollaborationStatusValue>(
    () => ({
      ready: enabled ? ready : true,
      enabled,
      providerFactory,
    }),
    [enabled, providerFactory, ready]
  );
}

function createProviderFactory(setReady: (value: boolean) => void, endpoint: string): ProviderFactory {
  return (id: string, docMap: Map<string, Y.Doc>) => {
    setReady(false);

    const doc = getOrCreateDoc(id, docMap);
    const room = resolveRoom(id);
    const provider = new WebsocketProvider(endpoint, room, doc, {
      connect: false,
    });

    provider.on('sync', (isSynced: boolean) => {
      if (isSynced) {
        setReady(true);
      }
    });

    provider.on('status', (event: { status: string }) => {
      if (event.status === 'connecting') {
        setReady(false);
      }
    });

    return provider as unknown as Provider;
  };
}

function resolveDefaultEndpoint() {
  const { protocol, hostname } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
  return `${wsProtocol}://${hostname}:${env.collabPort}`;
}

function resolveRoom(id: string): string {
  return `${id}-3`;
}

function getOrCreateDoc(id: string, docs: Map<string, Y.Doc>): Y.Doc {
  let doc = docs.get(id);
  if (!doc) {
    doc = new Y.Doc();
    //TODO do we need that?
    //doc.get('root', Y.XmlText);
    docs.set(id, doc);
  }
  return doc;
}
