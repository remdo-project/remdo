import type { LexicalEditor } from 'lexical'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
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
