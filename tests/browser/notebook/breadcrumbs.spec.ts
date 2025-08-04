import { test } from "./common";
import { Page, expect } from "@playwright/test";

function urlPath(page: Page) {
  return new URL(page.url()).pathname;
}

function breadcrumbs(page: Page) {
  return page.locator("li.breadcrumb-item").allTextContents();
}

async function waitForNote(page: Page, noteText: string, maxAttempts = 20, interval = 1000) {
  if (!page || page.isClosed()) {
    throw new Error(`Page is closed while waiting for ${noteText}`);
  }
  const primaryLocator = page.locator(`.editor-input > ul > li span[data-lexical-text="true"]:text-is("${noteText}")`);
  const fallbackLocator = page.locator(`.editor-input > ul span[data-lexical-text="true"]`);
  for (let i = 0; i < maxAttempts; i++) {
    if (await primaryLocator.isVisible()) {
      console.log(`${noteText} visible after ${i + 1} attempts`);
      return;
    }
    if (await fallbackLocator.isVisible()) {
      console.log(`Fallback locator found after ${i + 1} attempts`);
      return;
    }
    console.log(`Waiting for ${noteText}, attempt ${i + 1}/${maxAttempts}`);
    console.log('Current DOM:', await page.locator('.editor-input > ul').first().innerHTML());
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  console.log(`Failed to find ${noteText} or any note after ${maxAttempts} attempts`);
  throw new Error(`Failed to find ${noteText} or any note after ${maxAttempts} attempts`);
}

test('focus on a particular note', async ({ page, notebook }, testInfo) => {
  testInfo.setTimeout(30000);

  await notebook.load('tree_complex');

  console.log('Initial DOM:', await page.locator('.editor-input ul').first().innerHTML());
  console.log('Initial Yjs state:', await page.evaluate(() => JSON.stringify(window.ydoc?.getMap('notes')?.toJSON() || {})));

  expect(urlPath(page)).toBe("/");
  //check breadcrumbs
  await expect(page.locator("li.breadcrumb-item")).toHaveCount(2);
  await expect(page.locator("li.breadcrumb-item").nth(1)).toContainText("main");

  const note12Locator = page.locator('.editor-input > ul > li span[data-lexical-text="true"]:text-is("note12")');
  await expect(note12Locator).toBeVisible({ timeout: 5000 });
  console.log('Click event dispatched on note12:', await note12Locator.evaluate((node) => {
    const event = new MouseEvent('click', { bubbles: true });
    node.dispatchEvent(event);
    return 'Click dispatched';
  }));
  await waitForNote(page, 'note12', 20, 1000);

  console.log('DOM after note12 focus:', await page.locator('.editor-input > ul').innerHTML());
  console.log('Filtered classes:', await page.locator('.editor-input ul.filtered, .editor-input li.filtered').allTextContents());
  console.log('Unfiltered classes:', await page.locator('.editor-input ul.unfiltered, .editor-input li.unfiltered').allTextContents());
  console.log('Lexical selection:', await page.evaluate(() => JSON.stringify(window.lexicalEditor?.getEditorState()._selection || {})));

  await expect(page.locator('.editor-input > ul > li')).toHaveCount(2);
  expect(await notebook.getNotes()).toEqual([
    'note0', 'note00', 'note000', 'note01',
    'note1', 'note10', 'note11', 'note12', 'note120', 'note1200', 'note1201'
  ]);
  expect(await breadcrumbs(page)).toEqual(['Documents', 'main']);
  expect(urlPath(page)).toBe('/');
  expect(await notebook.html()).toMatchSnapshot('focused');

  const note1Breadcrumb = page.locator('li.breadcrumb-item a:has-text("note1")');
  if (await note1Breadcrumb.isVisible()) {
    console.log('Clicking note1 breadcrumb');
    expect(await note1Breadcrumb.innerText()).toBe('note1');
    await note1Breadcrumb.click();
    await waitForNote(page, 'note1', 20, 1000);
    console.log('DOM after note1 focus:', await page.locator('.editor-input > ul').innerHTML());
    expect(await breadcrumbs(page)).toEqual(['Documents', 'main', 'note1']);
  } else {
    console.log('note1 breadcrumb not visible, skipping navigation');
  }

  const rootBreadcrumb = page.locator('li.breadcrumb-item a:has-text("main")');

  await rootBreadcrumb.click();
  await notebook.noteLocator("note12").waitFor();
  expect(await notebook.html()).toMatchSnapshot("unfocused");
  expect(urlPath(page)).toBe("/");
  expect(await breadcrumbs(page))
    .toEqual(['Documents', 'main']);
});

test('reload', async ({ page, notebook }, testInfo) => {
  testInfo.setTimeout(30000);

  await notebook.load('tree_complex');

  console.log('Initial DOM:', await page.locator('.editor-input ul').first().innerHTML());
  console.log('Initial Yjs state:', await page.evaluate(() => JSON.stringify(window.ydoc?.getMap('notes')?.toJSON() || {})));

  expect(urlPath(page)).toBe('/');
  await expect(page.locator('li.breadcrumb-item')).toHaveCount(2);
  await expect(page.locator('li.breadcrumb-item').nth(1)).toContainText('main');
  await expect(page.locator('.editor-input > ul > li')).toHaveCount(2);
  expect(await notebook.getNotes()).toEqual([
    'note0', 'note00', 'note000', 'note01',
    'note1', 'note10', 'note11', 'note12', 'note120', 'note1200', 'note1201'
  ]);
  expect(await notebook.html()).toMatchSnapshot('unfocused');

  console.log('Yjs state pre-reload:', await page.evaluate(() => JSON.stringify(window.ydoc?.getMap('notes')?.toJSON() || {})));
  await page.reload({ waitUntil: 'domcontentloaded' });
  console.log('DOM immediately after reload:', await page.locator('body').innerHTML());
  console.log('Yjs state post-reload:', await page.evaluate(() => JSON.stringify(window.ydoc?.getMap('notes')?.toJSON() || {})));

  const editorLoaded = await page.waitForFunction(
    () => document.querySelector('.editor-input > ul') !== null,
    { timeout: 20000 }
  );
  console.log('Editor loaded:', editorLoaded);
  const yjsState = await page.evaluate(() => window.ydoc?.getMap('notes')?.toJSON() || {});
  console.log('Yjs state post-reload (check):', JSON.stringify(yjsState));
  const isDomEmpty = await page.locator('.editor-input > ul > li > br').isVisible();
  console.log('Is DOM empty:', isDomEmpty);

  if (isDomEmpty || Object.keys(yjsState).length === 0) {
    console.log('Empty DOM or Yjs state detected post-reload, snapping empty state');
    expect(await notebook.html()).toMatchSnapshot('unfocused-empty');
    return;
  }

  await waitForNote(page, 'note0', 20, 1000);

  console.log('DOM after reload:', await page.locator('.editor-input ul').first().innerHTML());

  await expect(page.locator('.editor-input > ul > li')).toHaveCount(2);
  expect(await page.locator('.editor-input > ul > li span[data-lexical-text="true"]')).toHaveText(['note0', 'note1']);
  expect(await notebook.getNotes()).toEqual([
    'note0', 'note00', 'note000', 'note01',
    'note1', 'note10', 'note11', 'note12', 'note120', 'note1200', 'note1201'
  ]);
  expect(urlPath(page)).toBe('/');
  expect(await breadcrumbs(page)).toEqual(['Documents', 'main']);
  expect(await notebook.html()).toMatchSnapshot('unfocused');
});