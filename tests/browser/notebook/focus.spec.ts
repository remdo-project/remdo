import { test } from "./common";
import { Page, expect } from "@playwright/test";

function urlPath(page: Page) {
  return new URL(page.url()).pathname;
}

test("focus on a particular note", async ({ page, notebook }) => {
  await notebook.load("tree_complex");

  // Initial assertions
  expect(urlPath(page)).toBe("/");
  await expect(page.locator("li.breadcrumb-item")).toHaveCount(2);
  await expect(page.locator("li.breadcrumb-item").nth(1)).toContainText("main");
  expect(await notebook.html()).toMatchSnapshot("unfocused");

  // Focus on note12
  const noteLocator = notebook.noteLocator("note12");
  await expect(noteLocator).toBeVisible();
  await noteLocator.click();

  // Wait a bit for UI to update (instead of waitForSelector that might hang)
  await page.waitForTimeout(200); 

  // Assert note12 is visible
  await expect(noteLocator).toBeVisible();

  // Snapshot of notebook after focus
  expect(await notebook.html()).toMatchSnapshot("focused");
});
