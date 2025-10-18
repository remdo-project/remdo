import type { LexicalEditor } from 'lexical';
import { render, screen } from '@testing-library/react';
import { $getRoot } from 'lexical';
import { expect, it } from 'vitest';
import App from '@/App';
import Editor from '@/editor/Editor';
import EditorTestBridge from './setup/internal/LexicalTestBridge';

it('app', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
});

it('editor', async () => {
  let editor!: LexicalEditor;
  render(
    <Editor>
      <EditorTestBridge onReady={(e) => (editor = e)} />
    </Editor>
  );
  expect(editor).toBeTruthy();
});

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

  expect(lexical).toMatchOutline([
    {
      text: 'note1',
      children: [
        {
          text: 'note2',
          children: [],
        },
      ],
    },
    {
      text: 'note3',
      children: [],
    },
  ]);
});

it.fails('fails when a warning is logged to the console', () => {
  console.warn('intentional warning to assert console guard');
});
