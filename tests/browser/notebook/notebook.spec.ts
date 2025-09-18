import { expect } from "@playwright/test";
import { test } from "./common";

test("move", async ({ page, notebook, menu }) => { 
  await notebook.load("flat");
  let notes = await notebook.getNotes();
  expect(notes).toEqual(["note0", "note1", "note2"]);
  await notebook.clickEndOfNote("note0");
  await menu.open();
  await page.keyboard.press("m");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  notes = await notebook.getNotes();
  expect(notes).toEqual(["note1", "note2", "note0"]);
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

test("load editor state", async ({ notebook }) => { 
  await notebook.load("basic");
  const html = await notebook.html(); 
  expect(html).toContain("note0"); 
  expect(html).toContain("note00"); 
});

test("clear content", async ({ page, notebook }) => { 
  await page.locator("text=Clear").click();
  const html = await notebook.html(); 
  expect(html).not.toContain("note0"); 
  expect(html).not.toContain("note00"); 
});

test("reorder flat", async ({ page, notebook }) => {
  await notebook.load("flat");
  let order = await notebook.getNotes();
  expect(order).toEqual(["note0", "note1", "note2"]);
  await notebook.clickEndOfNote("note2");
  await page.keyboard.press("Meta+ArrowUp");
  order = await notebook.getNotes();
  expect(order).toEqual(["note0", "note2", "note1"]);
  await page.keyboard.press("Meta+ArrowUp");
  order = await notebook.getNotes();
  expect(order).toEqual(["note2", "note0", "note1"]);
  await page.keyboard.press("Meta+ArrowUp"); // noop
  order = await notebook.getNotes();
  expect(order).toEqual(["note2", "note0", "note1"]);
  await page.keyboard.press("Meta+ArrowDown");
  order = await notebook.getNotes();
  expect(order).toEqual(["note0", "note2", "note1"]);

  await page.keyboard.press("Meta+ArrowDown");
  order = await notebook.getNotes();
  expect(order).toEqual(["note0", "note1", "note2"]);

  await page.keyboard.press("Meta+ArrowDown"); // noop
  order = await notebook.getNotes();
  expect(order).toEqual(["note0", "note1", "note2"]);
});

