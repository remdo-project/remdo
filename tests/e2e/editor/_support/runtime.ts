import { expect, setExpectedConsoleIssues } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { parseDocumentRef } from '#document-routes';
import { ensureReady, getEditorState, load } from './bridge';
import { editorLocator } from './locators';
import { createEditorDocumentPath } from './routes';

interface EditorLoadOptions {
  expectedConsoleIssues?: string[];
}

function resolveEditorDocIdFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const prefix = '/n/';
  if (!pathname.startsWith(prefix)) {
    throw new Error(`Unable to resolve editor document id from URL: ${url}`);
  }

  const docRef = pathname.slice(prefix.length);
  const parsed = parseDocumentRef(docRef);
  if (!parsed) {
    throw new Error(`Unable to resolve editor document id from URL: ${url}`);
  }

  return parsed.docId;
}

export async function captureCreatedEditorDoc(
  page: Page,
  createDoc: () => Promise<void>,
  trackDocId: (docId: string) => void,
): Promise<string> {
  const previousUrl = page.url();
  await createDoc();
  await expect(page).not.toHaveURL(previousUrl);
  await editorLocator(page).locator('.editor-input').first().waitFor();
  const docId = resolveEditorDocIdFromUrl(page.url());
  trackDocId(docId);
  return docId;
}

export async function createEditorHarness(page: Page, docId: string) {
  await page.goto(createEditorDocumentPath(docId));
  await editorLocator(page).locator('.editor-input').first().waitFor();
  await ensureReady(page);
  await editorLocator(page).locator('.editor-input').first().click();

  return {
    docId,
    load: (name: string, options?: EditorLoadOptions) => {
      const expectedCodes = options?.expectedConsoleIssues;
      if (expectedCodes?.length) {
        setExpectedConsoleIssues(page, expectedCodes);
      }
      return load(page, name);
    },
    getEditorState: () => getEditorState(page),
  };
}
