import { expect, readOutline, test as base } from '#e2e/fixtures';
import type { Locator, Page } from '#e2e/fixtures';
import { request } from '@playwright/test';
import type { Browser, BrowserContext, BrowserContextOptions } from '@playwright/test';
import { config } from '#config';
import { resolveLoopbackHost } from '#lib/net/loopback';
import { createTestAuthAccount } from '#tests-common/auth-account';
import { cleanupCollabDoc, createTestRuntimeScope } from '#tests-common/runtime-scope';
import { waitForSynced } from './bridge';
import {
  captureCreatedEditorDoc,
  createEditorHarness,
} from './runtime';

type EditorHarness = Awaited<ReturnType<typeof createEditorHarness>>;

async function createAuthenticatedEditorContext(
  browser: Browser,
  contextOptions: BrowserContextOptions,
): Promise<BrowserContext> {
  const requestHost = resolveLoopbackHost(config.env.HOST);
  const apiContext = await request.newContext({
    baseURL: `http://${requestHost}:${config.env.REMDO_API_PORT}`,
  });

  try {
    const response = await apiContext.post('/api/admin/users', {
      data: {
        ...createTestAuthAccount(),
        adminSecret: config.env.ADMIN_SECRET,
      },
    });
    if (!response.ok()) {
      throw new Error(`Failed to provision editor e2e user: ${response.status()} ${response.statusText()}`);
    }
    return browser.newContext({
      ...contextOptions,
      storageState: await apiContext.storageState(),
    });
  } finally {
    await apiContext.dispose();
  }
}

async function cleanupProfileCollabDocs(context: BrowserContext): Promise<void> {
  const response = await context.request.get('/api/profile');
  if (!response.ok()) {
    return;
  }

  const profile = await response.json() as Partial<{
    configDocumentId: string;
    homeDocumentId: string;
  }>;
  await Promise.all(
    [profile.configDocumentId, profile.homeDocumentId]
      .filter((docId): docId is string => typeof docId === 'string' && docId.length > 0)
      .map((docId) => cleanupCollabDoc(docId)),
  );
}

export const test = base.extend<
  {
    editor: EditorHarness;
    allocateEditorDocId: () => string;
    captureCreatedDoc: (page: Page, createDoc: () => Promise<void>) => Promise<string>;
    newEditorContext: () => Promise<BrowserContext>;
  }
>({
  context: async ({ browser, contextOptions }, applyFixture) => {
    const context = await createAuthenticatedEditorContext(browser, contextOptions);
    try {
      await applyFixture(context);
    } finally {
      await cleanupProfileCollabDocs(context);
      await context.close();
    }
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring for dependency discovery.
  allocateEditorDocId: async ({}, applyFixture) => {
    const runtimeScope = createTestRuntimeScope();
    await applyFixture(() => runtimeScope.allocateDocId());
    await runtimeScope.cleanupOwnedDocs();
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring for dependency discovery.
  captureCreatedDoc: async ({}, applyFixture) => {
    const ownedDocIds = new Set<string>();
    const trackDocId = (docId: string) => {
      ownedDocIds.add(docId);
    };
    await applyFixture((page, createDoc) => captureCreatedEditorDoc(page, createDoc, trackDocId));
    await Promise.all(Array.from(ownedDocIds, (docId) => cleanupCollabDoc(docId)));
  },
  newEditorContext: async ({ browser, context, contextOptions }, applyFixture) => {
    await applyFixture(async () => browser.newContext({
      ...contextOptions,
      storageState: await context.storageState(),
    }));
  },
  editor: async ({ page, allocateEditorDocId }, applyFixture) => {
    const editor = await createEditorHarness(page, allocateEditorDocId());
    await applyFixture(editor);
    await waitForSynced(page);
  },
});

export { expect, readOutline };
export type { Page, Locator };
