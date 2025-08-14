import { test, Notebook } from "./common";
import { Page, expect } from "@playwright/test";

function urlPath(page: Page) {
  return new URL(page.url()).pathname;
}

async function waitForNoteVisible(notebook: Notebook, noteText: string) {
  const locator = notebook.noteLocator(noteText);
  await expect(locator).toBeVisible({ timeout: 10000 });
}

async function getBreadcrumbs(page: Page) {
  return page.locator("li.breadcrumb-item").allTextContents();
}

test("focus on a particular note", async ({ page, notebook }) => {
  await notebook.load("tree_complex");

  expect(urlPath(page)).toBe("/");

  await expect(page.locator("li.breadcrumb-item")).toHaveCount(2);
  await expect(page.locator("li.breadcrumb-item").nth(1)).toContainText("main");

  await waitForNoteVisible(notebook, "note12");

  // Click note12 to focus
  const note12Locator = notebook.noteLocator("note12");
  const box = await note12Locator.boundingBox();
  if (!box) throw new Error("note12 bounding box not found");
  await page.mouse.click(box.x - 1, box.y + box.height / 2);

  await expect(note12Locator).toBeVisible();

  expect(await notebook.getNotes()).toEqual([
    "note12", "note120", "note1200", "note1201"
  ]);

  expect(await getBreadcrumbs(page)).toEqual(["Documents", "main", "note1", "note12"])
  expect(await notebook.html()).toMatchSnapshot("focused");

  // Click root breadcrumb to unfocus
  const rootBreadcrumb = page.locator('li.breadcrumb-item a:has-text("main")');
  await rootBreadcrumb.click();
  await waitForNoteVisible(notebook, "note12");

  expect(await notebook.html()).toMatchSnapshot("unfocused");
  expect(await getBreadcrumbs(page)).toEqual(["Documents", "main"]);
  expect(urlPath(page)).toBe("/");
});

// Keep the original reload test untouched as requested
test.fixme("reload", async ({ page, notebook }) => {
  await notebook.load("tree_complex");
});

// Optional third test: fold / navigation check
test("folding and breadcrumb navigation", async ({ page, notebook }) => {
  await notebook.load("tree_complex");

  await waitForNoteVisible(notebook, "note1");

  // Click note1 to focus
  const note1Locator = notebook.noteLocator("note1");
  const box = await note1Locator.boundingBox();
  if (!box) throw new Error("note1 bounding box not found");
  await page.mouse.click(box.x - 1, box.y + box.height / 2);

  expect(await notebook.getNotes()).toContain("note12");

  // Breadcrumbs should reflect navigation
  expect(await getBreadcrumbs(page)).toEqual(["Documents", "main", "note1"]);

  // Click root to go back
  const rootBreadcrumb = page.locator('li.breadcrumb-item a:has-text("main")');
  await rootBreadcrumb.click();
  await waitForNoteVisible(notebook, "note12");

  expect(await getBreadcrumbs(page)).toEqual(["Documents", "main"]);
  expect(urlPath(page)).toBe("/");
});
