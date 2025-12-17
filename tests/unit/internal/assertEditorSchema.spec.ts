import type { SerializedEditorState } from 'lexical';
import { describe, expect, it } from 'vitest';
import { assertEditorSchema } from '@/editor/plugins/dev/schema/assertEditorSchema';
import emptyText from '#fixtures/editor-schema/empty-text.json';
import indentJump from '#fixtures/editor-schema/indent-jump.json';
import listWrapperNoListitem from '#fixtures/editor-schema/list-wrapper-no-listitem.json';
import minimalValid from '#fixtures/editor-schema/minimal-valid.json';
import wrapperWithoutSibling from '#fixtures/editor-schema/wrapper-without-sibling.json';

describe('assertEditorSchema', () => {
  const cast = (data: unknown) => data as SerializedEditorState;

  it('accepts a minimal valid outline', () => {
    expect(() => assertEditorSchema(cast(minimalValid))).not.toThrow();
  });

  it('throws for wrapper list item without preceding sibling', () => {
    expect(() => assertEditorSchema(cast(wrapperWithoutSibling))).toThrowError(
      'Invalid outline structure: wrapper list item without preceding list item sibling'
    );
  });

  it('throws when a nested list lacks list item children', () => {
    expect(() => assertEditorSchema(cast(listWrapperNoListitem))).toThrowError(
      'Invalid outline structure: list wrapper without list item child'
    );
  });

  it('throws on indent jumps greater than one level', () => {
    expect(() => assertEditorSchema(cast(indentJump))).toThrowError(
      'Invalid outline structure: indent jumped from 0 to 2 at "1"'
    );
  });

  it('ignores list items with empty text content', () => {
    expect(() => assertEditorSchema(cast(emptyText))).not.toThrow();
  });
});
