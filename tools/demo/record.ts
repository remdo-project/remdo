#!/usr/bin/env tsx
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import { config } from '#config';
import type { DemoAccount } from '../lib/demo-account';
import { demoAccount, resetDemoAccount } from '../lib/demo-account';
import { outlining } from './outlining';
import type { OutlineNote } from './stage';
import { readOutline, Stage } from './stage';

const scenarios = { outlining };
type ScenarioName = keyof typeof scenarios;

const USAGE = [
  `Usage: pnpm demo:record <${Object.keys(scenarios).join('|')}> [origin]`,
  'Resets the origin\'s user account, whose password REMDO_USER_PASSWORD holds, then records',
  'the scenario to $DATA_DIR/demo/<scenario>.webm. The origin defaults to https://remdo.com.',
].join('\n');
const VIEWPORT = { width: 1280, height: 720 };
const END_STATE_TIMEOUT_MS = 15_000;

function isScenarioName(name: string | undefined): name is ScenarioName {
  return name !== undefined && Object.hasOwn(scenarios, name);
}

async function signIn(browser: Browser, origin: string, account: DemoAccount): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'en-US' });
  const configUrl = new URL('/api/config', origin).href;
  const { csrfToken } = await (await context.request.get(configUrl, { failOnStatusCode: true })).json() as { csrfToken: string };
  await context.request.post(new URL('/api/auth/browser/v1/auth/login', origin).href, {
    data: account,
    // Django's HTTPS CSRF check requires a same-origin Origin or Referer.
    headers: { 'X-CSRFToken': csrfToken, Origin: origin },
    failOnStatusCode: true,
  });
  return context;
}

async function openDocument(page: Page, origin: string, documentId: string): Promise<void> {
  await page.goto(new URL(`/n/${documentId}`, origin).href);
  await page.locator('.editor-container [data-lexical-editor] li.list-item').first().waitFor();
}

// A fresh context has no local copy, so the outline it shows comes from the server.
async function confirmEndState(browser: Browser, context: BrowserContext, origin: string, documentId: string, expected: OutlineNote[]): Promise<void> {
  const fresh = await browser.newContext({ viewport: VIEWPORT, storageState: await context.storageState() });
  try {
    const page = await fresh.newPage();
    await openDocument(page, origin, documentId);
    const deadline = Date.now() + END_STATE_TIMEOUT_MS;
    let actual = await readOutline(page);
    while (!isDeepStrictEqual(actual, expected)) {
      if (Date.now() > deadline) {
        throw new Error(`End state not reached.\nExpected: ${JSON.stringify(expected)}\nActual:   ${JSON.stringify(actual)}`);
      }
      await page.waitForTimeout(250);
      actual = await readOutline(page);
    }
  } finally {
    await fresh.close();
  }
}

async function main(): Promise<void> {
  const [name, originArgument = 'https://remdo.com', ...extra] = process.argv.slice(2);
  if (!isScenarioName(name) || extra.length > 0) {
    throw new Error(USAGE);
  }
  const scenario = scenarios[name];
  const origin = new URL(originArgument).origin;
  // eslint-disable-next-line node/no-process-env -- a deployment secret, absent from the development config schema.
  const password = process.env.REMDO_USER_PASSWORD;
  if (!password) {
    throw new Error('REMDO_USER_PASSWORD must hold the target\'s user account password.');
  }
  const account = demoAccount(origin, password);

  const outputDir = path.join(config.env.DATA_DIR, 'demo');
  const output = path.join(outputDir, `${name}.webm`);
  const partial = `${output}.partial`;
  await mkdir(outputDir, { recursive: true });

  const { document } = await resetDemoAccount(origin, account);
  const browser = await chromium.launch();
  try {
    const context = await signIn(browser, origin, account);
    const page = await context.newPage();
    await openDocument(page, origin, document.id);
    await page.locator('.editor-container [data-lexical-editor]').focus();

    await page.screencast.start({ path: partial, size: VIEWPORT });
    try {
      const stage = new Stage(page);
      await stage.captionActions();
      await scenario.run(stage);
    } finally {
      await page.screencast.stop();
    }
    await confirmEndState(browser, context, origin, document.id, scenario.endState);
    await rename(partial, output);
    console.info(`Recorded ${output}`);
  } finally {
    await browser.close();
    await rm(partial, { force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
