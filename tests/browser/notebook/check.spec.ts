import { test } from './common';
import { expect } from '@playwright/test';

test("check/uncheck", async ({ page, notebook }) => {
  // Load notebook with a single note, ready to vibe
  await notebook.load("single");

  // Locator for note0's <li> with its text span
  const note0 = page.locator('ul > li:has(span[data-lexical-text="true"]:text-is("note0"))');

  // Initial state: one note, "note0", no check mark
  await expect(page.locator('ul > li')).toHaveCount(1);
  await expect(note0.locator('span[data-lexical-text="true"]')).toHaveText('note0');
  await expect(note0).not.toHaveClass(/li-checked/);
  expect(await notebook.html()).toMatchSnapshot("base");

  // Click note0’s end, hit Meta+Enter to check it
  await notebook.clickEndOfNote("note0");
  await page.keyboard.press("Meta+Enter");

  // Checked state: note0 rocks the li-checked class
  await expect(note0).toHaveClass(/li-checked/);
  await expect(note0.locator('span[data-lexical-text="true"]')).toHaveText('note0');
  expect(await notebook.html()).toMatchSnapshot("checked");

  // Hit Meta+Enter again to uncheck the vibe
  await page.keyboard.press("Meta+Enter");

  // Unchecked state: no li-checked, note0 still chill
  await expect(note0).not.toHaveClass(/li-checked/);
  await expect(note0.locator('span[data-lexical-text="true"]')).toHaveText('note0');
  expect(await notebook.html()).toMatchSnapshot("base");
});
