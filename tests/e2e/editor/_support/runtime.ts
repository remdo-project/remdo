import type { Browser, BrowserContext } from '@playwright/test';
import { expect, setExpectedConsoleIssues } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { parseDocumentRef } from '@/routing';
import { REMDO_E2E_TEST_RUNTIME_GLOBAL } from '@/testing/e2e-runtime';
import { ensureReady, getEditorState, load } from './bridge';
import { editorLocator } from './locators';
import { createEditorDocumentPath } from './routes';

interface EditorLoadOptions {
  expectedConsoleIssues?: string[];
}

export async function bindEditorRuntimeContext(
  context: BrowserContext,
  userConfigDocId: string
): Promise<void> {
  const runtimeState = { userConfigDocId };
  await context.addInitScript(
    ({ globalKey, injectedRuntime }) => {
      (globalThis as Record<string, unknown>)[globalKey] = injectedRuntime;
    },
    {
      globalKey: REMDO_E2E_TEST_RUNTIME_GLOBAL,
      injectedRuntime: runtimeState,
    }
  );
}

export async function createIsolatedEditorContext(browser: Browser, userConfigDocId: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  await bindEditorRuntimeContext(context, userConfigDocId);
  return context;
}

function resolveEditorDocIdFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const prefix = '/e2e/n/';
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
