import { env } from '#config/env-client';
import { render, waitFor } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import type { LexicalEditor } from 'lexical';
import { $createListItemNode, $createListNode } from '@lexical/list';
import { describe, expect, it } from 'vitest';
import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import Editor from '@/editor/Editor';
import type { CollaborationStatusValue } from '@/editor/plugins/collaboration';
import { useCollaborationStatus } from '@/editor/plugins/collaboration';

interface PeerHandle {
  editor: LexicalEditor;
  waitForSync: () => Promise<void>;
  hasUnsyncedChanges: () => boolean;
}

function CollaborationPeer({ onReady }: { onReady: (handle: PeerHandle) => void }) {
  const [editor] = useLexicalComposerContext();
  const collab = useCollaborationStatus();
  const statusRef = useRef<CollaborationStatusValue>(collab);

  useEffect(() => {
    statusRef.current = collab;
  }, [collab]);

  useEffect(() => {
    onReady({
      editor,
      waitForSync: () => statusRef.current.waitForSync(),
      hasUnsyncedChanges: () => statusRef.current.hasUnsyncedChanges,
    });
  }, [editor, onReady]);

  return null;
}

describe.skipIf(!env.collabEnabled)('collaboration sync', () => {
  it('syncs edits between editors', async ({ lexical }) => {
    let secondary!: PeerHandle;

    render(
      <Editor>
        <CollaborationPeer onReady={(handle) => { secondary = handle; }} />
      </Editor>
    );

    await waitFor(() => {
      if (!secondary) throw new Error('Secondary editor not ready');
    });

    await Promise.all([lexical.waitForCollabSync(), secondary.waitForSync()]);

    const readText = (editor: LexicalEditor) =>
      editor.getEditorState().read(() => $getRoot().getTextContent().trim());

    lexical.editor.update(() => {
      $getRoot().clear();
    });

    await Promise.all([lexical.waitForCollabSync(), secondary.waitForSync()]);

    expect(readText(lexical.editor)).toBe('');
    expect(readText(secondary.editor)).toBe('');
    expect(lexical.hasCollabUnsyncedChanges()).toBe(false);
    expect(secondary.hasUnsyncedChanges()).toBe(false);

    lexical.editor.update(() => {
      const root = $getRoot();
      root.clear();

      const list = $createListNode('bullet');
      const item = $createListItemNode();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('shared note'));
      item.append(paragraph);
      list.append(item);
      root.append(list);
    });

    await Promise.all([lexical.waitForCollabSync(), secondary.waitForSync()]);

    expect(lexical.hasCollabUnsyncedChanges()).toBe(false);
    expect(secondary.hasUnsyncedChanges()).toBe(false);
    expect(readText(lexical.editor)).toBe('shared note');
    expect(readText(secondary.editor)).toBe('shared note');
  });
});
