//copied from ~/projects/notes/lexical/packages/lexical-react/src/LexicalCollaborationPlugin.ts
//TODO describe differences
//TODO add a test confirming diff
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {Doc} from 'yjs';

import {useCollaborationContext} from '@lexical/react/LexicalCollaborationContext';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {Provider} from '@lexical/yjs';
import {useEffect, useMemo} from 'react';

import {InitialEditorStateType} from '@lexical/react/LexicalComposer';
import {
  CursorsContainerRef,
  useYjsCollaboration,
  useYjsFocusTracking,
  useYjsHistory,
} from '@lexical/react/shared/useYjsCollaboration';

export function CollaborationPlugin({
  id,
  providerFactory,
  shouldBootstrap,
  username,
  cursorColor,
  cursorsContainerRef,
  initialEditorState,
}: {
  id: string;
  providerFactory: (
    // eslint-disable-next-line no-shadow
    id: string,
    yjsDocMap: Map<string, Doc>,
  ) => Provider;
  shouldBootstrap: boolean;
  username?: string;
  cursorColor?: string;
  cursorsContainerRef?: CursorsContainerRef;
  initialEditorState?: InitialEditorStateType;
}): JSX.Element {
  const collabContext = useCollaborationContext(username, cursorColor);

  const {yjsDocMap, name, color} = collabContext;

  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    collabContext.isCollabActive = true;

    return () => {
      // Reseting flag only when unmount top level editor collab plugin. Nested
      // editors (e.g. image caption) should unmount without affecting it
      if (editor._parentEditor == null) {
        collabContext.isCollabActive = false;
      }
    };
  }, [collabContext, editor]);

  const provider = useMemo(
    () => providerFactory(id, yjsDocMap),
    [id, providerFactory, yjsDocMap],
  );

  const [cursors, binding] = useYjsCollaboration(
    editor,
    id,
    provider,
    yjsDocMap,
    name,
    color,
    shouldBootstrap,
    cursorsContainerRef,
    initialEditorState,
  );

  collabContext.clientID = binding.clientID;
  //@ts-ignore remdo customization
  collabContext.binding = binding;

  useYjsHistory(editor, binding);
  useYjsFocusTracking(editor, provider, name, color);

  return cursors;
}
