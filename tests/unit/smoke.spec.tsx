import type { LexicalEditor } from 'lexical';
import { $isListItemNode, $isListNode } from '@lexical/list';
import { render, screen } from '@testing-library/react';
import { $getRoot } from 'lexical';
import { expect, it } from 'vitest';
import App from '@/App';
import Editor from '@/editor/Editor';
import EditorTestBridge from './setup/internal/LexicalTestBridge';

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
  lexical.load('basic');

  // commented to not overwrite output snapshot from other tests
  // preview();
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

    // First note: "note1" with one child "note2"
    expect(notes[0]?.getTextContent()).toContain('note1');

    const nextItem = allItems[allItems.indexOf(notes[0]!) + 1];
    if (!$isListItemNode(nextItem)) throw new Error('Expected list item');

    const nestedList = nextItem.getChildren().find($isListNode);
    if (!$isListNode(nestedList)) throw new Error('Expected nested list');

    expect(nestedList.getChildren()).toHaveLength(1);
    expect(nestedList.getChildren()[0]?.getTextContent()).toBe('note2');

    // Second note: "note3"
    expect(notes[1]?.getTextContent()).toBe('note3');
  });
});
