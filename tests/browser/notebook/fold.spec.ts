import { expect } from "@playwright/test";
import { test, notebook } from "./common"; 


test("add new element after a folded one", async ({ page, notebook }) => {
  await notebook.load("folded");

  await notebook.clickEndOfNote("note0");
  await page.keyboard.press("Enter");

  // Grab the full HTML from Lexical
  const htmlAfter = await notebook.html();

  // Direct snapshot of the Lexical DOM — captures structure and all data attributes
  expect(htmlAfter).toMatchSnapshot("after-addition");
});

test("fold to a specific level", async ({ page, notebook }) => {
  await notebook.load("tree_complex");

  // Capture initial Lexical DOM
  const baseHtml = await notebook.html();
  expect(baseHtml).toMatchSnapshot("base");

  // Fold to level 1
  await page.keyboard.press("Shift");
  await page.keyboard.press("Shift");
  await page.keyboard.press("1");
  expect(await notebook.html()).toMatchSnapshot("level1");

  // Fold to level 3
  await page.keyboard.press("Shift");
  await page.keyboard.press("Shift");
  await page.keyboard.press("3");
  expect(await notebook.html()).toMatchSnapshot("level3");

  // Unfold back to base
  await page.keyboard.press("Shift");
  await page.keyboard.press("Shift");
  await page.keyboard.press("0");
  expect(await notebook.html()).toMatchSnapshot("base");
});
