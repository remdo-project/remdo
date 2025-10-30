/* eslint-disable react-refresh/only-export-components */
import type { LexicalEditor } from 'lexical';
import { useEffect } from 'react';
import type { TestContext } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import Editor from '@/editor/Editor';
import type { CollaborationStatusValue } from '@/editor/plugins/collaboration';
import { useCollaborationStatus } from '@/editor/plugins/collaboration';
import { createLexicalTestHelpers } from './state';

interface BridgePayload {
  editor: LexicalEditor;
  collab: CollaborationStatusValue;
}

const Bridge = ({ onReady }: { onReady: (payload: BridgePayload) => void }) => {
  const [editor] = useLexicalComposerContext();
  const collab = useCollaborationStatus();

  useEffect(() => {
    onReady({ editor, collab });
  }, [collab, editor, onReady]);

  return null;
};

const LexicalHarness = ({ onReady }: { onReady: (payload: BridgePayload) => void }) => {
  return (
    <Editor>
      <Bridge onReady={onReady} />
    </Editor>
  );
};

beforeEach<TestContext>(async (ctx) => {
  let editor!: LexicalEditor;
  let collab!: CollaborationStatusValue;

  render(
    <LexicalHarness
      onReady={({ editor: instance, collab: status }) => {
        editor = instance;
        collab = status;
      }}
    />
  );

  await waitFor(() => {
    if (!editor || !collab) throw new Error('Lexical editor not initialized in time');
  });

  const helpers = createLexicalTestHelpers(editor, () => collab);
  ctx.lexical = helpers;

  await helpers.resetDocument();
  await helpers.waitForCollabSync();
});

afterEach(async ({ lexical }) => {
  await lexical.waitForCollabSync();
});
