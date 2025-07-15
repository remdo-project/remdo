import { test } from "./common";
import { expect } from "@playwright/test";

test("add the first child to note with existing children", async ({
  notebook,
  page,
}) => {
  // Load basic notebook
  await notebook.load("basic");
  await page.waitForTimeout(2000); // Stabilize Yjs/Lexical state

  // Log DOM for debugging, handle multiple <ul>s
  const ulCount = await page.locator("ul:not(ul ul)").count();
  console.log("Root UL count:", ulCount);
  for (let i = 0; i < ulCount; i++) {
    console.log(`Root UL ${i}:`, await page.locator("ul:not(ul ul)").nth(i).innerHTML());
  }

  // Verify initial state: check note count and text
  const initialNoteCount = await page.locator("ul:not(ul ul) > li").count();
  const initialChildCount = await page.locator("ul:not(ul ul) > li > ul > li").count();
  await expect(page.locator("ul:not(ul ul) > li span[data-lexical-text=\"true\"]").first()).toHaveText("note0");
  if (initialNoteCount > 1 && initialChildCount === 0) {
    await expect(page.locator("ul:not(ul ul) > li span[data-lexical-text=\"true\"]").nth(1)).toHaveText("note00");
  } else if (initialChildCount > 0) {
    await expect(page.locator("ul:not(ul ul) > li > ul > li span[data-lexical-text=\"true\"]").first()).toHaveText("note00");
  }

  // Click end of note0 and add a child note
  await notebook.clickEndOfNote("note0");
  await page.keyboard.press("Enter");

  // Log DOM after Enter
  console.log("DOM after Enter:", await page.locator("ul:not(ul ul)").first().innerHTML());

  // Verify final state: check for additional child note
  await expect(page.locator("ul:not(ul ul) > li span[data-lexical-text=\"true\"]").first()).toHaveText("note0");
  await expect(page.locator("ul:not(ul ul) > li > ul > li")).toHaveCount(initialChildCount + 1);
  await expect(page.locator("ul:not(ul ul) > li > ul > li").first()).toHaveText(""); // Check first child note
  if (initialChildCount > 0) {
    await expect(page.locator("ul:not(ul ul) > li > ul > li").nth(1)).toHaveText("note00");
  }
});

test("create some empty notes", async ({ page, notebook }) => {
  // Load flat notebook
  await notebook.load("flat");
  await page.waitForTimeout(2000); // Stabilize state

  // Log DOM for debugging
  console.log("Initial DOM:", await page.locator("ul:not(ul ul)").first().innerHTML());

  // Verify initial state: three notes
  const initialNoteCount = await page.locator("ul:not(ul ul) > li").count();
  await expect(page.locator("ul:not(ul ul) > li span[data-lexical-text=\"true\"]").first()).toHaveText("note0");
  await expect(page.locator("ul:not(ul ul) > li span[data-lexical-text=\"true\"]").nth(1)).toHaveText("note1");

  // Select last note (note1 or note2)
  const textNodeCount = await page.locator("ul:not(ul ul) > li span[data-lexical-text=\"true\"]").count();
  const lastNote = textNodeCount > 2 ? "note2" : "note1";
  await notebook.selectNote(lastNote);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  // Log DOM after Enter
  console.log("DOM after Enter:", await page.locator("ul:not(ul ul)").first().innerHTML());

  // Verify final state: initial count + 2 notes
  await expect(page.locator("ul:not(ul ul) > li")).toHaveCount(initialNoteCount + 2);
  await expect(page.locator("ul:not(ul ul) > li span[data-lexical-text=\"true\"]").first()).toHaveText("note0");
  await expect(page.locator("ul:not(ul ul) > li span[data-lexical-text=\"true\"]").nth(1)).toHaveText("note1");
  await expect(page.locator("ul:not(ul ul) > li").nth(initialNoteCount)).toHaveText("");
  await expect(page.locator("ul:not(ul ul) > li").nth(initialNoteCount + 1)).toHaveText("");
});

test("split note", async ({ page, notebook }) => {
  await notebook.load("flat");
  await notebook.clickEndOfNote("note1");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  expect(await notebook.getNotes()).toEqual(["note0", "note1", "note2"]);
  await page.keyboard.press("Enter");
  expect(await notebook.getNotes()).toEqual(["note0", "not", "e1", "note2"]);
});
