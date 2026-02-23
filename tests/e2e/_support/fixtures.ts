import type { ConsoleMessage, Page, Response } from '@playwright/test';
import { expect, test as base } from '@playwright/test';
import type { Outline } from '#tests-common/outline';
import { extractOutlineFromEditorState, mutateOutlineNoteIdWildcards } from '#tests-common/outline';

interface EditorLike {
  getEditorState: () => Promise<unknown>;
}

export async function readOutline(editor: EditorLike): Promise<Outline> {
  return extractOutlineFromEditorState(await editor.getEditorState());
}

interface ConsoleIssueMatchers {
  exactCounts: Map<string, number>;
  containsCounts: Map<string, number>;
  allowedContains: string[];
}

type ConsoleIssueMatchMode = 'exact' | 'contains' | 'allowContains';

interface ConsoleIssuePatternOptions {
  mode?: ConsoleIssueMatchMode;
}

const issueExpectationsByPage = new WeakMap<Page, ConsoleIssueMatchers>();

function createIssueCounts(messages: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const message of messages) {
    counts.set(message, (counts.get(message) ?? 0) + 1);
  }
  return counts;
}

function appendIssueCounts(target: Map<string, number>, messages: string[]): void {
  for (const message of messages) {
    target.set(message, (target.get(message) ?? 0) + 1);
  }
}

export function setExpectedConsoleIssues(
  page: Page,
  messages: string[],
  options: ConsoleIssuePatternOptions = {},
): void {
  const mode = options.mode ?? 'exact';
  const current =
    issueExpectationsByPage.get(page) ??
    {
      exactCounts: createIssueCounts([]),
      containsCounts: createIssueCounts([]),
      allowedContains: [],
    };
  if (mode === 'exact') {
    appendIssueCounts(current.exactCounts, messages);
  } else if (mode === 'contains') {
    appendIssueCounts(current.containsCounts, messages);
  } else {
    for (const message of messages) {
      if (!current.allowedContains.includes(message)) {
        current.allowedContains.push(message);
      }
    }
  }
  issueExpectationsByPage.set(page, current);
}

function consumeExpectedIssue(expected: ConsoleIssueMatchers | undefined, issueMessage: string): boolean {
  if (!expected) {
    return false;
  }
  const exactRemaining = expected.exactCounts.get(issueMessage) ?? 0;
  if (exactRemaining > 0) {
    if (exactRemaining === 1) {
      expected.exactCounts.delete(issueMessage);
    } else {
      expected.exactCounts.set(issueMessage, exactRemaining - 1);
    }
    return true;
  }
  for (const [pattern, remaining] of expected.containsCounts.entries()) {
    if (remaining <= 0) {
      continue;
    }
    if (!issueMessage.includes(pattern)) {
      continue;
    }
    if (remaining === 1) {
      expected.containsCounts.delete(pattern);
    } else {
      expected.containsCounts.set(pattern, remaining - 1);
    }
    return true;
  }
  for (const pattern of expected.allowedContains) {
    if (issueMessage.includes(pattern)) {
      return true;
    }
  }
  return false;
}

export function attachPageGuards(page: Page): () => void {
  const allowResponse = (response: Response) => {
    const url = response.url();
    if (url.startsWith('data:')) return true;
    if (url.includes('favicon') && response.status() === 404) return true;
    return false;
  };

  const onConsole = (message: ConsoleMessage) => {
    const type = message.type();
    if (type !== 'warning' && type !== 'error') return;

    const issueMessage = message.text();
    const expected = issueExpectationsByPage.get(page);
    if (consumeExpectedIssue(expected, issueMessage)) {
      return;
    }

    throw new Error(`console.${type}: ${message.text()}`);
  };

  const onPageError = (error: Error) => {
    const details = error.stack || error.message || String(error);
    throw new Error(`pageerror: ${details}`);
  };

  const onResponse = (response: Response) => {
    const status = response.status();
    if (status >= 400 && !allowResponse(response)) {
      throw new Error(`response ${status}: ${response.url()}`);
    }
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  return () => {
    const expected = issueExpectationsByPage.get(page);
    const outstandingExact = expected ? [...expected.exactCounts.entries()] : [];
    const outstandingContains = expected ? [...expected.containsCounts.entries()] : [];
    const outstanding = [...outstandingExact, ...outstandingContains];
    if (outstanding.length > 0) {
      const remaining = outstanding.flatMap(([message, count]) =>
        Array.from({ length: count }, () => message));
      throw new Error(`Expected console issues not reported: ${remaining.join(', ')}`);
    }
    issueExpectationsByPage.delete(page);
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  };
}

export const test = base.extend({
  page: async ({ page }, apply) => {
    const detach = attachPageGuards(page);
    await apply(page);
    detach();
  },
});

expect.extend({
  async toMatchOutline(received: unknown, expected: Outline) {
    if (this.isNot) {
      return {
        pass: true,
        message: () => 'expect(...).not.toMatchOutline(...) is not supported; assert a positive outline instead.',
      };
    }

    const target = received as Partial<EditorLike> | null;
    if (!target || typeof target.getEditorState !== 'function') {
      return {
        pass: false,
        message: () => 'Expected a target with getEditorState(): Promise<unknown>.',
      };
    }

    try {
      await expect
        .poll(async () => {
          const actual = extractOutlineFromEditorState(await target.getEditorState!());
          mutateOutlineNoteIdWildcards(actual, expected);
          return actual;
        })
        .toEqual(expected);
      return { pass: true, message: () => 'Expected outlines not to match.' };
    } catch (error) {
      return {
        pass: false,
        message: () => (error instanceof Error ? error.message : String(error)),
      };
    }
  },
});

export { expect };
export type { Page, Locator } from '@playwright/test';
