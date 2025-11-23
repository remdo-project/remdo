import { config } from '#config';
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
  waitForSynced: () => Promise<void>;
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
    const waitForSynced: PeerHandle['waitForSynced'] = () => statusRef.current.awaitSynced();
    const validate: PeerHandle['validate'] = (fn) => editor.getEditorState().read(fn);

    onReady({
      editor,
      waitForSynced,
      validate,
    });
  }, [editor, onReady]);

  return null;
}

describe('collaboration sync', () => {
  it('syncs edits between editors', async ({ lexical }) => {
    let secondary!: PeerHandle;
    const { protocol, hostname } = globalThis.location;
    const collabOrigin = `${protocol}//${hostname}:${config.env.COLLAB_CLIENT_PORT}`;
    // TODO: unify editor construction and collab origin setup with the shared test harness helpers.

    render(
      <Editor collabOrigin={collabOrigin}>
        <CollaborationPeer onReady={(handle) => { secondary = handle; }} />
      </Editor>
    );

    await waitFor(() => {
      // eslint-disable-next-line ts/no-unnecessary-condition
      if (!secondary) throw new Error('Secondary editor not ready');
    });

    await Promise.all([lexical.waitForSynced(), secondary.waitForSynced()]);

    lexical.editor.update(() => {
      $getRoot().clear();
    });

    await Promise.all([lexical.waitForSynced(), secondary.waitForSynced()]);

    expect(lexical).toMatchOutline([]);
    expect(secondary as any).toMatchOutline([]);
    await lexical.waitForSynced();
    await secondary.waitForSynced();
    lexical.editor.update(() => {
      //TODO use a higher level API once we have it
      const root = $getRoot();
      const list = $createListNode('bullet');
      const item = $createListItemNode();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('note1'));
      item.append(paragraph);
      list.append(item);
      root.append(list);
    });

    await Promise.all([lexical.waitForSynced(), secondary.waitForSynced()]);

    await lexical.waitForSynced();
    await secondary.waitForSynced();
    const sharedOutline = [{ text: 'note1', children: [] }];
    await waitFor(() => {
      expect(lexical).toMatchOutline(sharedOutline);
      expect(secondary as any).toMatchOutline(sharedOutline);
    });
  });
});
