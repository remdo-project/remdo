import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { LexicalCollaboration, useCollaborationContext } from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPluginV2__EXPERIMENTAL } from '@lexical/react/LexicalCollaborationPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { defineExtension } from 'lexical';
import { useEffect, useMemo } from 'react';
import { createProviderFactory } from '#collaboration/runtime';
import { editorConfig } from '#client/editor/runtime/config';
import { NoteCheckedDisplayPlugin } from '#client/editor/features/list-types/NoteCheckedDisplayPlugin';
import { NoteMarkerPlugin } from '#client/editor/features/list-types/NoteMarkerPlugin';
import './Editor.css';

const outlineViewExtension = defineExtension({ ...editorConfig, name: 'remdo-outline-view', editable: false });

/**
 * A workspace document's outline, read-only and live: it joins the document's room and mounts only
 * display plugins, so it never writes. The hub seeds the room from the file.
 */
export default function WorkspaceOutline({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="editor-container">
      <LexicalCollaboration>
        <LexicalExtensionComposer extension={outlineViewExtension} contentEditable={null}>
          <WorkspaceRoom room={`workspace:${workspaceId}`} />
          <RichTextPlugin
            contentEditable={<ContentEditable aria-label="Outline" className="editor-input" />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <NoteMarkerPlugin />
          <NoteCheckedDisplayPlugin />
        </LexicalExtensionComposer>
      </LexicalCollaboration>
    </div>
  );
}

function WorkspaceRoom({ room }: { room: string }) {
  const { yjsDocMap } = useCollaborationContext();
  const { provider, doc } = useMemo(() => createProviderFactory()(room, yjsDocMap), [room, yjsDocMap]);

  useEffect(() => () => {
    provider.destroy();
    doc.destroy();
  }, [provider, doc]);

  return <CollaborationPluginV2__EXPERIMENTAL id={room} provider={provider} doc={doc} />;
}
