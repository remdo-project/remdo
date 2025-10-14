import type { LexicalEditor } from 'lexical';
import { $isListItemNode, $isListNode } from '@lexical/list';
import { render, screen } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical'
import { expect, it } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- keep debug helper for local preview coverage
import { debug } from 'vitest-preview'
import App from '@/App'
import Editor from '@/editor/Editor'
import EditorTestBridge from './utils/LexicalTestBridge'

it('app', () => {
  render(<App />)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
})

it('editor', async () => {
  let editor!: LexicalEditor
  render(
    <Editor>
      <EditorTestBridge onReady={(e) => (editor = e)} />
    </Editor>
  )
  expect(editor).toBeTruthy()
})

it('lexical helpers', async ({ lexical }) => {
  await lexical.mutate(() => {
    $getRoot().clear();
  });

  lexical.validate(() => {
    expect($getRoot().getTextContent()).toBe('');
  });
});

it('debug preview', async ({ lexical }) => {
  await lexical.mutate(() => {
    const root = $getRoot();
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode('Vitest Preview in action'));
    root.append(paragraph);
  });

  // commented to not overwrite output snapshot from other tests
  //debug();
  void debug; // prevent unused warning
});

it('loads basic outline structure from JSON', ({ lexical }) => {
  lexical.load('basic');

  lexical.validate(() => {
    const rootList = $getRoot().getFirstChild();
    if (!$isListNode(rootList)) throw new Error('Expected root list');

    const allItems = rootList.getChildren();
    const notes = allItems.filter((item) =>
      $isListItemNode(item) && item.getChildren().some((child) =>
        !$isListNode(child) && child.getTextContent().trim()
      )
    );

    expect(notes).toHaveLength(2);

    // First note: "note0" with one child "note00"
    expect(notes[0]?.getTextContent()).toContain('note0');

    const nextItem = allItems[allItems.indexOf(notes[0]!) + 1];
    if (!$isListItemNode(nextItem)) throw new Error('Expected list item');

    const nestedList = nextItem.getChildren().find($isListNode);
    if (!$isListNode(nestedList)) throw new Error('Expected nested list');

    expect(nestedList.getChildren()).toHaveLength(1);
    expect(nestedList.getChildren()[0]?.getTextContent()).toBe('note00');

    // Second note: "note1"
    expect(notes[1]?.getTextContent()).toBe('note1');
  });
});
