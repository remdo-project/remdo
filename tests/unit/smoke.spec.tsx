import type { LexicalEditor } from 'lexical';
import { render, screen } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical'
import { expect, it } from 'vitest'
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
    <Editor extraPlugins={<EditorTestBridge onReady={(e) => (editor = e)} />} />
  )
  expect(editor).toBeTruthy()
})

it('lexical helpers', async ({ lexicalMutate, lexicalValidate }) => {
  await lexicalMutate(() => {
    $getRoot().clear();
  });

  lexicalValidate(() => {
    expect($getRoot().getTextContent()).toBe('');
  });
});

it('debug preview', async ({ lexicalMutate}) => {
  await lexicalMutate(() => {
    const root = $getRoot();
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode('Vitest Preview in action'));
    root.append(paragraph);
  });

  // commented to not overwrite output snapshot from other tests
  //debug();
  void debug; // prevent unused warning
});
