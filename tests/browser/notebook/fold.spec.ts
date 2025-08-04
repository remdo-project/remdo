import { test } from "./common";
import { expect } from "@playwright/test";

test("add new element after a folded one", async ({ page, notebook }) => {
  await notebook.load("folded");
  await notebook.clickEndOfNote("note0");
  await page.keyboard.press("Enter");

  // Get HTML after adding new element
  const htmlAfter = await notebook.html();

  // Assert that original element still exists
  expect(htmlAfter).toContain('note0');
  // Assert that a new element was added (e.g., note1 or an increased count
  expect(htmlAfter).toMatch(/note\d+/);
  // Assert that the new element is added after the children list of the original one
  expect(htmlAfter).toMatchSnapshot();
});

test("fold to a specific level", async ({ page, notebook }) => {
  await notebook.load("tree_complex");

  // Check initial state
  const baseHtml = await notebook.html();
  expect(baseHtml).toMatchSnapshot("base");
  // Assert that tree structure contains expected notes/elements
  expect(baseHtml).toContain('note'); 
  expect(baseHtml).toContain('<ul>');
  // Fold to level 1
  await page.keyboard.press("Shift");
  await page.keyboard.press("Shift");
  await page.keyboard.press("1");
  const level1Html = await notebook.html();
  expect(level1Html).toMatchSnapshot("level1");
  expect(level1Html).not.toEqual(baseHtml); // Should have changed

  // Fold to level 3
  await page.keyboard.press("Shift");
  await page.keyboard.press("Shift");
  await page.keyboard.press("3");
  const level3Html = await notebook.html();
  expect(level3Html).toMatchSnapshot("level3");
  expect(level3Html).not.toEqual(level1Html); // Should have changed

  // Fold back to level 0 (unfold)
  await page.keyboard.press("Shift");
  await page.keyboard.press("Shift");
  await page.keyboard.press("0");
  const unfoldedHtml = await notebook.html();
  expect(unfoldedHtml).toMatchSnapshot("base");
  expect(unfoldedHtml).toEqual(baseHtml); // Should be same as base
});
