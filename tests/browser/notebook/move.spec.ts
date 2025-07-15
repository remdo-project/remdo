import { htmlToCommaSeparatedText } from "tests/common";
import { test } from "./common";
import { expect } from "@playwright/test";

test("move", async ({ page, notebook, menu }) => {
  await notebook.load("flat");

  let notes = htmlToCommaSeparatedText(await notebook.html());
  expect(notes).toBe("note0,note1,note2");

  await notebook.clickEndOfNote("note0");
  await menu.open();
  await page.keyboard.press("m");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  notes = htmlToCommaSeparatedText(await notebook.html());
  expect(notes).toBe("note1,note2,note0");
});

//FIXME
test.fixme("move and search", async ({ page, notebook, menu }) => {
  await notebook.load("flat");

  expect(await notebook.getNotes()).toEqual(["note0", "note1", "note2"]);

  await notebook.clickEndOfNote("note0");
  await menu.open();
  await page.keyboard.press("m");
  await page.keyboard.type("note2");
  await page.keyboard.press("Enter");

  //expect(await notebook.getNotes()).toEqual(["note1", "note2", "note0"]);
});
