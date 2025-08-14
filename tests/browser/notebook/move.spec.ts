import { htmlToCommaSeparatedText } from "tests/common";
import { test } from "./common";
import { expect } from "@playwright/test";

test("move", async ({ page, notebook, menu }) => {
  await notebook.load("flat");

  let html = await notebook.html();
  let notes = htmlToCommaSeparatedText(html);
  expect(notes).toBe("note0,note1,note2");

  await notebook.clickEndOfNote("note0");
  await menu.open();

  await page.keyboard.press("m");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  html = await notebook.html();
  notes = htmlToCommaSeparatedText(html);
  expect(notes).toBe("note1,note2,note0");
});

test.fixme("move and search", async ({ page, notebook, menu }) => {
  await notebook.load("flat");

  const initialNotes = await notebook.getNotes();
  expect(initialNotes).toEqual(["note0", "note1", "note2"]);

  await notebook.clickEndOfNote("note0");
  await menu.open();
  await page.keyboard.press("m");
  await page.keyboard.type("note2");
  await page.keyboard.press("Enter");

  const updatedNotes = await notebook.getNotes();
  expect(updatedNotes).toEqual(["note1", "note2", "note0"]);
});
