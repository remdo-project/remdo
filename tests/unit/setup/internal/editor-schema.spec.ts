import type { SerializedEditorState } from 'lexical';
import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/editor-schema/minimal-valid.json';
import { assertEditorSchema } from './editor-schema';

describe('assertEditorSchema', () => {
  it('accepts a minimal valid outline', () => {
    const state = fixture.editorState as unknown as SerializedEditorState;
    expect(() => assertEditorSchema(state)).not.toThrow();
  });
});
