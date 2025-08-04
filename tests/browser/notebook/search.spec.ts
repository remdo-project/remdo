import { test } from "./common"; 
import { expect } from "@playwright/test";

test("search", async ({ page, notebook }) => { 
  await notebook.load("flat"); 
  const searchInput = page.locator("#search");
  
  const allNotes = ["note0", "note1", "note2"]; 
  let visibleNotes = await notebook.getNotes(); 
  expect(visibleNotes).toEqual(allNotes);

  await searchInput.fill("note"); 
  visibleNotes = await notebook.getNotes(); 
  expect(visibleNotes).toEqual(allNotes);

  await searchInput.fill("1"); 
  visibleNotes = await notebook.getNotes(); 
  expect(visibleNotes).toEqual(["note1"]); 
});

test("search and focus", async ({ page, notebook }) => { 
  await notebook.load("tree");

  const initialNotes = ["note0", "sub note 0", "note1", "sub note 1"];
  expect(await notebook.getNotes()).toEqual(initialNotes);

  const searchInput = page.locator("#search"); 
  await searchInput.fill("note0"); 
  await page.keyboard.press("Enter");

  const filteredNotes = await notebook.getNotes(); 
  expect(filteredNotes).toEqual(["note0", "sub note 0"]); 
});

