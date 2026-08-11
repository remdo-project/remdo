import { $createAutoLinkNode, AutoLinkNode, LinkNode } from '@lexical/link';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
} from 'lexical';
import type { LexicalEditor } from 'lexical';
import { describe, expect, it } from 'vitest';

import {
  $getAutomaticLinkUnlinkedText,
  $setAutomaticLinkUnlinkedText,
} from '#client/editor/runtime/automatic-link-state';

function update(editor: LexicalEditor, callback: () => void): Promise<void> {
  return new Promise((resolve) => editor.update(callback, { onUpdate: resolve }));
}

function $getOnlyAutoLink(): AutoLinkNode {
  const link = $getRoot().getAllTextNodes()[0]?.getParent();
  if (!(link instanceof AutoLinkNode)) {
    throw new TypeError('Expected one automatic link.');
  }
  return link;
}

describe('automatic link suppression state', () => {
  it('can clear a suppression baseline loaded from serialized node state', async () => {
    const url = 'https://example.com/';
    const source = createEditor({ nodes: [LinkNode, AutoLinkNode] });
    await update(source, () => {
      const link = $createAutoLinkNode(url, { isUnlinked: true });
      link.append($createTextNode(url));
      $setAutomaticLinkUnlinkedText(link, url);
      $getRoot().append($createParagraphNode().append(link));
    });

    const restored = createEditor({ nodes: [LinkNode, AutoLinkNode] });
    restored.setEditorState(restored.parseEditorState(JSON.stringify(source.getEditorState())));
    await update(restored, () => {
      const link = $getOnlyAutoLink();
      expect($getAutomaticLinkUnlinkedText(link)).toBe(url);
      $setAutomaticLinkUnlinkedText(link, null);
      expect($getAutomaticLinkUnlinkedText(link)).toBeNull();
    });

    restored.getEditorState().read(() => {
      expect($getAutomaticLinkUnlinkedText($getOnlyAutoLink())).toBeNull();
    });
  });
});
