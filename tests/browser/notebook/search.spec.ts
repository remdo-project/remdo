import { test } from "./common";
import { expect } from "@playwright/test";

test("search", async ({ page, notebook }) => {
  await notebook.load("flat");
  const searchInput = page.locator("#search");

  const all = ["note0", "note1", "note2"];

  expect(await notebook.getNotes()).toEqual(all);

  await searchInput.fill("note");
  expect(await notebook.getNotes()).toEqual(all);

  await searchInput.fill("1");
  expect(await notebook.getNotes()).toEqual(["note1"]);
});

test("search and focus", async ({ page, notebook }) => {
  await notebook.load("tree");

  expect(await notebook.getNotes()).toEqual(
    ["note0", "sub note 0", "note1", "sub note 1"]);

  const searchInput = page.locator("#search");
  await searchInput.fill("note0");
  await page.keyboard.press("Enter");
  expect(await notebook.getNotes()).toEqual(
    ["note0", "sub note 0"]);
});
