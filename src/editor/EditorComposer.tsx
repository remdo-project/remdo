import type { Provider } from "@lexical/yjs";
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';

import { useCallback } from 'react';
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { useEditorConfig } from './config';
import { IndentationPlugin } from './plugins/IndentationPlugin';
import { RootSchemaPlugin } from './plugins/RootSchemaPlugin';
import { SchemaValidationPlugin } from './plugins/SchemaValidationPlugin';
import { TreeViewPlugin } from './plugins/TreeViewPlugin';

interface EditorComposerProps {
  children?: React.ReactNode;
}

export function EditorComposer({ children }: EditorComposerProps) {
  const { initialConfig, dev } = useEditorConfig();
  const isTestEnv = import.meta.env.MODE === 'test';
  const collabEnabled = dev && !isTestEnv;

  const providerFactory = useCallback((id: string, docMap: Map<string, Y.Doc>): Provider | null => {
    if(!collabEnabled) {
      return null;
    }
    let doc = docMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(id, doc);
    }

    const endpoint = (() => {
      const { protocol, hostname } = window.location;
      const wsProtocol = protocol === "https:" ? "wss" : "ws";
      return `${wsProtocol}://${hostname}:4004`;
    })();

    const provider = new WebsocketProvider(endpoint, `${id}-3`, doc, {
      connect: false,
    });

    provider.on("status", (event: { status: string }) => {
      // eslint-disable-next-line no-console
      console.info(`Collaboration status for "${id}": ${event.status}`);
    });

    return provider as unknown as Provider;
  }, [collabEnabled]);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-inner">
        <RichTextPlugin
          contentEditable={<ContentEditable className="editor-input" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <RootSchemaPlugin />
        <IndentationPlugin />
        <ListPlugin hasStrictIndent />
        {collabEnabled ? (
          <LexicalCollaboration>
            <CollaborationPlugin
              id="lexical-demo-room2"
              //@ts-expect-error TODO
              providerFactory={providerFactory}
              shouldBootstrap
            />
          </LexicalCollaboration>
        ) : (
          <HistoryPlugin />
        )}
        {children}
        {dev && <SchemaValidationPlugin />}
        {dev && <TreeViewPlugin />}
      </div>
    </LexicalComposer>
  );
}

export default EditorComposer;
