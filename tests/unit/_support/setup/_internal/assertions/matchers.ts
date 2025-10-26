import type { TestContext } from 'vitest';
import type { Outline } from '#tests';
import { expect } from 'vitest';
import { readOutline } from '#tests';

type LexicalTestHelpers = TestContext['lexical'];

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

function attemptRead<T>(
  ctx: any,
  matcherName: string,
  reader: () => T
): { ok: true; value: T } | { ok: false; result: MatcherResult } {
  const { matcherHint } = ctx.utils;

  try {
    return { ok: true, value: reader() };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      result: {
        pass: false,
        message: () => `${matcherHint(matcherName)}\n\n${reason}`,
      },
    };
  }
}

function compareWithExpected<T>(
  ctx: any,
  actual: T,
  expected: T,
  options: { matcher: string; args: string[]; passMessage: string; failMessage: string }
): MatcherResult {
  const { matcherHint } = ctx.utils;
  const { matcher, args, passMessage, failMessage } = options;

  if (ctx.equals(actual, expected)) {
    return {
      pass: true,
      message: () => `${matcherHint(`.not.${matcher}`, ...args)}\n\n${passMessage}`,
    };
  }

  expect(actual).toEqual(expected);

  return {
    pass: false,
    message: () => `${matcherHint(`.${matcher}`, ...args)}\n\n${failMessage}`,
  };
}

expect.extend({
  toMatchOutline(this: any, lexical: LexicalTestHelpers, expected: Outline) {
    const outline = attemptRead(this, '.toMatchOutline', () => readOutline(lexical.validate));
    if (!outline.ok) return outline.result;

    return compareWithExpected(this, outline.value, expected, {
      matcher: 'toMatchOutline',
      args: ['lexical', 'expectedOutline'],
      passMessage: 'Expected outlines not to match, but readOutline produced the same structure.',
      failMessage: 'Outlines differ.',
    });
  },

  toMatchEditorState(this: any, lexical: LexicalTestHelpers, expected: unknown) {
    const actual = attemptRead(this, '.toMatchEditorState', () => lexical.getEditorState());
    if (!actual.ok) return actual.result;

    return compareWithExpected(this, actual.value, expected, {
      matcher: 'toMatchEditorState',
      args: ['lexical', 'expectedState'],
      passMessage: 'Expected editor state not to match, but toJSON returned identical data.',
      failMessage: 'Editor state differs.',
    });
  },
});
