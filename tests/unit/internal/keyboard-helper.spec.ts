import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  createEditor,
  ParagraphNode,
  TextNode,
} from 'lexical';
import type { LexicalEditor } from 'lexical';
import { pressKey, typeText } from '#tests';

interface EditorHarness {
  editor: LexicalEditor;
  waitForSynced: () => Promise<void>;
}

function getText(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $getRoot().getTextContent());
}

async function setCaret(editor: LexicalEditor, offset: number) {
  await act(async () => {
    editor.update(() => {
      const root = $getRoot();
      const firstChild = root.getFirstChild();
      const paragraph = firstChild as ParagraphNode | null;
      const textNode = paragraph?.getFirstChild() as TextNode | null;
      if (!$isTextNode(textNode)) {
        throw new Error('Expected text node');
      }
      const clamped = Math.max(0, Math.min(offset, textNode.getTextContentSize()));
      textNode.select(clamped, clamped);
    });
  });
}

async function createPlainEditor(
  initialText: string
): Promise<{ harness: EditorHarness; root: HTMLElement; dispose: () => void }> {
  const root = document.createElement('div');
  document.body.append(root);

  const editor = createEditor({
    namespace: 'keyboard-helper-contract',
    nodes: [ParagraphNode, TextNode],
  });
  root.setAttribute('contenteditable', 'true');
  root.tabIndex = 0;
  editor.setRootElement(root);
  const unregisterInsert = editor.registerCommand(
    CONTROLLED_TEXT_INSERTION_COMMAND,
    (text: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertText(text);
        }
      });
      return true;
    },
    0
  );

  await act(async () => {
    editor.update(() => {
      const lexicalRoot = $getRoot();
      lexicalRoot.clear();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(initialText));
      lexicalRoot.append(paragraph);
      paragraph.select();
    });
    root.focus();
  });

  return {
    harness: {
      editor,
      waitForSynced: async () => {},
    },
    root,
    dispose: () => {
      root.remove();
      unregisterInsert();
    },
  };
}

describe('keyboard helper contract (pure Lexical)', () => {
  it('typeText inserts characters when keydown is allowed', async () => {
    const { harness, dispose } = await createPlainEditor('note1');
    await setCaret(harness.editor, 5);

    await typeText(harness as any, 'xy');

    expect(getText(harness.editor)).toBe('note1xy');
    dispose();
  });

  it('typeText respects a prevented keydown', async () => {
    const { harness, root, dispose } = await createPlainEditor('note1');
    root.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'x') {
          event.preventDefault();
        }
      },
      { once: true }
    );

    await setCaret(harness.editor, 5);
    const before = getText(harness.editor);

    await typeText(harness as any, 'x');

    expect(getText(harness.editor)).toBe(before);
    dispose();
  });

  it('pressKey handles non-text keys (Escape no-op with caret)', async () => {
    const { harness, dispose } = await createPlainEditor('note1');
    await setCaret(harness.editor, 0);
    const before = getText(harness.editor);

    await pressKey(harness as any, { key: 'Escape' });

    expect(getText(harness.editor)).toBe(before);
    const selection = harness.editor.getEditorState().read(() => $getSelection());
    expect($isRangeSelection(selection) && selection.anchor.offset === 0 && selection.focus.offset === 0).toBe(true);
    dispose();
  });

  it('pressKey rejects plain printable characters', async () => {
    const { harness, dispose } = await createPlainEditor('note1');
    await setCaret(harness.editor, 0);

    await expect(pressKey(harness as any, { key: 'x' })).rejects.toThrow(/use typeText/);
    dispose();
  });

  it('pressKey rejects unsupported non-text chords', async () => {
    const { harness, dispose } = await createPlainEditor('note1');
    await setCaret(harness.editor, 0);

    await expect(pressKey(harness as any, { key: 'F13' })).rejects.toThrow(/does not support/);
    dispose();
  });

  it('pressKey(Delete) only fires keydown; inline delete needs a higher-level helper', async () => {
    const { harness, dispose } = await createPlainEditor('note1');
    await setCaret(harness.editor, 0);

    await pressKey(harness as any, { key: 'Delete' });

    expect(getText(harness.editor)).toBe('note1');
    dispose();
  });

  it('inline forward delete helper removes next char at caret', async () => {
    const { harness, dispose } = await createPlainEditor('note1');
    await setCaret(harness.editor, 0);

    await inlineDelete(harness);

    expect(getText(harness.editor)).toBe('ote1');
    const selection = harness.editor.getEditorState().read(() => $getSelection());
    expect($isRangeSelection(selection) && selection.anchor.offset === 0 && selection.focus.offset === 0).toBe(true);
    dispose();
  });
});

async function inlineDelete(harness: EditorHarness) {
  await act(async () => {
    harness.editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const anchor = selection.anchor.getNode();
        const offset = selection.anchor.offset;
        const target = $isTextNode(anchor) ? anchor : null;
        if (target && offset < target.getTextContentSize()) {
          target.spliceText(offset, offset + 1, '');
          selection.anchor.set(target.getKey(), offset, 'text');
          selection.focus.set(target.getKey(), offset, 'text');
        }
      }
    });
  });
}
