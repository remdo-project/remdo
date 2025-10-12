import type { LexicalEditor } from 'lexical';
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
