import type { TestContext } from 'vitest';
import type { Outline } from '#tests';
import { expect } from 'vitest';
import { readOutline } from '#tests';

type LexicalTestHelpers = TestContext['lexical'];

expect.extend({
  toMatchOutline(this: any, lexical: LexicalTestHelpers, expected: Outline) {
    const { matcherHint } = this.utils;

    let outline: Outline;
    try {
      outline = readOutline(lexical.validate);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        pass: false,
        message: () => `${matcherHint('.toMatchOutline')}\n\n${reason}`,
      };
    }

    if (this.equals(outline, expected)) {
      return {
        pass: true,
        message: () =>
          `${matcherHint('.not.toMatchOutline', 'lexical', 'expectedOutline')}\n\n` +
          'Expected outlines not to match, but readOutline produced the same structure.',
      };
    }

    expect(outline).toEqual(expected);

    return {
      pass: false,
      message: () =>
        `${matcherHint('.toMatchOutline', 'lexical', 'expectedOutline')}\n\nOutlines differ.`,
    };
  },

  toMatchEditorState(this: any, lexical: LexicalTestHelpers, expected: unknown) {
    const { matcherHint } = this.utils;

    let actual;
    try {
      actual = lexical.getEditorState();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        pass: false,
        message: () => `${matcherHint('.toMatchEditorState')}\n\n${reason}`,
      };
    }

    if (this.equals(actual, expected)) {
      return {
        pass: true,
        message: () =>
          `${matcherHint('.not.toMatchEditorState', 'lexical', 'expectedState')}\n\n` +
          'Expected editor state not to match, but toJSON returned identical data.',
      };
    }

    expect(actual).toEqual(expected);

    return {
      pass: false,
      message: () =>
        `${matcherHint('.toMatchEditorState', 'lexical', 'expectedState')}\n\nEditor state differs.`,
    };
  },
});
