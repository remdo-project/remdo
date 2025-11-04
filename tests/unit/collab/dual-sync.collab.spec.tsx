import { config } from '#config/client';
import { render, waitFor } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import type { LexicalEditor } from 'lexical';
import { $createListItemNode, $createListNode } from '@lexical/list';
import { describe, expect, it } from 'vitest';
import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import Editor from '@/editor/Editor';
import { useCollaborationStatus } from '@/editor/plugins/collaboration';
import type { CollaborationStatusValue } from '@/editor/plugins/collaboration';

interface PeerHandle {
  editor: LexicalEditor;
  waitForCollabSync: () => Promise<void>;
  hasCollabUnsyncedChanges: () => boolean;
  validate: <T>(fn: () => T) => T;
}

function CollaborationPeer({ onReady }: { onReady: (handle: PeerHandle) => void }) {
  const [editor] = useLexicalComposerContext();
  const collab = useCollaborationStatus();
  const statusRef = useRef<CollaborationStatusValue>(collab);

  useEffect(() => {
    statusRef.current = collab;
  }, [collab]);

  useEffect(() => {
    const waitForCollabSync: PeerHandle['waitForCollabSync'] = () => statusRef.current.waitForSync();
    const hasCollabUnsyncedChanges: PeerHandle['hasCollabUnsyncedChanges'] = () =>
      statusRef.current.hasUnsyncedChanges;
    const validate: PeerHandle['validate'] = (fn) => editor.getEditorState().read(fn);

    onReady({
      editor,
      waitForCollabSync,
      hasCollabUnsyncedChanges,
      validate,
    });
  }, [editor, onReady]);

  return null;
}

describe.skipIf(!config.COLLAB_ENABLED)('collaboration sync', () => {
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

    await Promise.all([lexical.waitForCollabSync(), secondary.waitForCollabSync()]);

    lexical.editor.update(() => {
      $getRoot().clear();
    });

    await Promise.all([lexical.waitForCollabSync(), secondary.waitForCollabSync()]);

    expect(lexical).toMatchOutline([]);
    expect(secondary as any).toMatchOutline([]);
    expect(lexical.hasCollabUnsyncedChanges()).toBe(false);
    expect(secondary.hasCollabUnsyncedChanges()).toBe(false);

    lexical.editor.update(() => {
      //TODO use a higher level API once we have it
      const root = $getRoot();
      const list = $createListNode('bullet');
      const item = $createListItemNode();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('shared note'));
      item.append(paragraph);
      list.append(item);
      root.append(list);
    });

    await Promise.all([lexical.waitForCollabSync(), secondary.waitForCollabSync()]);

    expect(lexical.hasCollabUnsyncedChanges()).toBe(false);
    expect(secondary.hasCollabUnsyncedChanges()).toBe(false);
    const sharedOutline = [{ text: 'shared note', children: [] }];
    expect(lexical).toMatchOutline(sharedOutline);
    expect(secondary as any).toMatchOutline(sharedOutline);
  });
});
