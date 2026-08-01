import type { TextNode } from 'lexical';
import type { Provider, UserState } from '@lexical/yjs';
import {
  createBindingV2__EXPERIMENTAL,
  syncCursorPositions,
} from '@lexical/yjs';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
} from 'lexical';
import {
  createRelativePositionFromTypeIndex,
  Doc,
  XmlText,
} from 'yjs';
import { describe, expect, it } from 'vitest';

describe('lexical collaboration cursor synchronization', () => {
  it('ignores a remote cursor whose mapped text node was deleted', () => {
    const editor = createEditor({ namespace: 'stale-collaboration-cursor' });
    const doc = new Doc();
    const binding = createBindingV2__EXPERIMENTAL(
      editor,
      'stale-collaboration-cursor',
      doc,
      new Map([[doc.guid, doc]])
    );
    const sharedText = doc.get('cursor-text', XmlText);
    sharedText.insert(0, 'cursor');

    let textNode: TextNode | null = null;
    editor.update(() => {
      textNode = $createTextNode('cursor');
      $getRoot().append($createParagraphNode().append(textNode));
    }, { discrete: true });

    const mappedTextNode = textNode!;
    binding.mapping.set(sharedText, [mappedTextNode]);
    editor.update(() => {
      mappedTextNode.remove();
    }, { discrete: true });

    const cursorPosition = createRelativePositionFromTypeIndex(sharedText, 0);
    const remoteClientId = doc.clientID + 1;
    const remoteState: UserState = {
      anchorPos: cursorPosition,
      awarenessData: {},
      color: '#000000',
      focusing: true,
      focusPos: cursorPosition,
      name: 'Remote',
    };
    const provider: Provider = {
      awareness: {
        getLocalState: () => null,
        getStates: () => new Map(),
        off: () => {},
        on: () => {},
        setLocalState: () => {},
        setLocalStateField: () => {},
      },
      connect: () => {},
      disconnect: () => {},
      off: () => {},
      on: () => {},
    };

    expect(() => {
      syncCursorPositions(binding, provider, {
        getAwarenessStates: () => new Map([[remoteClientId, remoteState]]),
      });
    }).not.toThrow();
    expect(binding.cursors.get(remoteClientId)?.selection).toBeNull();
  });
});
