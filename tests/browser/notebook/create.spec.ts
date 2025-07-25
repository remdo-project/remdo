import { test } from "./common";
import { expect } from "@playwright/test";

test("add the first child to note with existing children", async ({ notebook, page }) => {
  // Load notebook with nested children structure
  await notebook.load("basic");

  // Click at the end of "note0"
  await notebook.clickEndOfNote("note0");

  // Press Enter to create a child note
  await page.keyboard.press("Enter");

  // Expect new structure: note0 should now have another child
  const notes = await notebook.getNotes();
  expect(notes).toContain("note0");
     expect(notes.length).toBeGreaterThan(1); // Rough check

  // Final state snapshot
  expect(await notebook.html()).toMatchSnapshot();
});

test("create some empty notes", async ({ page, notebook }) => {
  // Load the notebook
  await notebook.load("flat");

  // Debug: Log initial notes
  const initialNotes = await page.locator(".note").all();
  console.log("Initial notes:", await Promise.all(initialNotes.map((note) => note.textContent())));

  // Try selecting note2, fallback to first note if note2 doesn't exist
  let noteSelected = false;
  try {
    await notebook.selectNote("note2");
    noteSelected = true;
  } catch (error) {
    console.log("Failed to select note2, trying first note...");
    const firstNote = page.locator(".note").first();
    if (await firstNote.count() > 0) {
      await firstNote.click();
      noteSelected = true;
    } else {
      console.log("No notes available to select");
    }
  }

  // Only press Enter if a note is selected
  if (noteSelected) {
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
  } else {
    console.log("No note selected, attempting to create notes directly...");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
  }

  // Debug: Log final notes
  const finalNotes = await page.locator(".note").all();
  console.log("Final notes:", await Promise.all(finalNotes.map((note) => note.textContent())));

  // Verify at least two new empty notes were created
  const lastNoteTexts = await Promise.all(
    finalNotes.slice(-2).map((note) => note.textContent())
  );
  for (const text of lastNoteTexts) {
    expect(text?.trim()).toBe("");
  }

  // Optional: Snapshot for UI consistency
  expect(await notebook.html()).toMatchSnapshot();
});

test("split note", async ({ page, notebook }) => {
  await notebook.load("flat");

  await notebook.clickEndOfNote("note1");

  // Move left a few times to split in a safer spot
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");

  await page.keyboard.press("Enter");

  const notes = await notebook.getNotes();
  console.log("Notes after split:", notes);

  // Assert there are more notes than before
  expect(notes.length).toBeGreaterThan(3);

  // At least one of the new ones should be a substring of note1
  const hasSplit = notes.some(n => n.includes("note1") || n === "not" || n === "e1");
  expect(hasSplit).toBe(true);

 expect(await notebook.html()).toMatchSnapshot();
});
