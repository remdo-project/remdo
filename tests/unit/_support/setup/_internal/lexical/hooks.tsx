/* eslint-disable react-refresh/only-export-components */
import { config } from '#config';
import { $getRoot } from 'lexical';
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

let previousDefaultDocId: string | null = null;
let collabDocCounter = 0;
beforeEach<TestContext>(async (ctx) => {
  let editor!: LexicalEditor;
  let collab!: CollaborationStatusValue;

  const meta = ctx.task.meta as { collabDocId?: string; collabDefaultDoc?: string };

  if (typeof meta.collabDefaultDoc === 'string') {
    previousDefaultDocId = config.env.COLLAB_DOCUMENT_ID;
    (config.env as any).COLLAB_DOCUMENT_ID = meta.collabDefaultDoc;
  } else {
    previousDefaultDocId = null;
  }

  let docId = meta.collabDocId ?? config.env.COLLAB_DOCUMENT_ID;
  if (config.env.COLLAB_ENABLED && meta.collabDocId == null && meta.collabDefaultDoc == null) {
    const base = ctx.task?.id ?? ctx.task?.name ?? 'spec';
    const normalized = base.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'spec';
    docId = `test-${normalized}-${collabDocCounter++}`;
  }
  const href = globalThis.location?.href ?? window.location.href;
  const url = new URL(href);
  const params = new URLSearchParams(url.search);
  params.set('doc', docId);
  const nextSearch = params.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
  globalThis.history.replaceState(null, '', nextUrl);

  render(
    <LexicalHarness
      onReady={({ editor: instance, collab: status }) => {
        editor = instance;
        collab = status;
      }}
    />
  );

  await waitFor(() => {
    // eslint-disable-next-line ts/no-unnecessary-condition
    if (!editor || !collab) throw new Error('Lexical editor not initialized in time');
  });

  const helpers = createLexicalTestHelpers(editor, () => collab);
  ctx.lexical = helpers;

  if (collab.enabled) {
    await helpers.waitForCollabSync();
    await helpers.mutate(() => {
      $getRoot().clear();
    });
    await helpers.waitForCollabSync();
  }
});

afterEach(async ({ lexical }) => {
  await lexical.waitForCollabSync();

  if (previousDefaultDocId !== null) {
    (config.env as any).COLLAB_DOCUMENT_ID = previousDefaultDocId;
    previousDefaultDocId = null;
  }
});
