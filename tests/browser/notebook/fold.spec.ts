import { test } from "./common";
import { expect } from "@playwright/test";

test("add new element after a folded one", async ({ page, notebook }) => {
  await notebook.load("folded");
  await notebook.clickEndOfNote("note0");
  await page.keyboard.press("Enter");
  // the original element should stay untouched, the new one should be added
  // after it, or to be more precise, after the children list of the original one
  expect(await notebook.html()).toMatchSnapshot();
});

test("fold to a specific level", async ({ page, notebook }) => {
  await notebook.load("tree_complex");
  expect(await notebook.html()).toMatchSnapshot("base");

  await page.keyboard.press("Shift");
  await page.keyboard.press("Shift");
  await page.keyboard.press("1");
  expect(await notebook.html()).toMatchSnapshot("level1");

  await page.keyboard.press("Shift");
  await page.keyboard.press("Shift");
  await page.keyboard.press("3");
  expect(await notebook.html()).toMatchSnapshot("level3");

  await page.keyboard.press("Shift");
  await page.keyboard.press("Shift");
  await page.keyboard.press("0");
  expect(await notebook.html()).toMatchSnapshot("base");
});
