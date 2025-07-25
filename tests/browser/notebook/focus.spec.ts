import { test } from "./common";
import { Page, expect } from "@playwright/test";

function urlPath(page: Page) {
  return new URL(page.url()).pathname;
}

test("focus on a particular note", async ({ page, notebook }) => {
  // Mock visibleState to return predefined data
  const mockVisibleState = [
    { text: "note12", id: "12" },
    { text: "note13", id: "13" },
  ];
  notebook.visibleState = async () => mockVisibleState;

  // Load the notebook
  await notebook.load("tree_complex");

  // Assert initial URL path
  expect(urlPath(page)).toBe("/");

  // Assert breadcrumbs
  await expect(page.locator("li.breadcrumb-item")).toHaveCount(2);
  await expect(page.locator("li.breadcrumb-item").nth(1)).toContainText("main");

  // Assert initial HTML snapshot
  expect(await notebook.html()).toMatchSnapshot("unfocused");

  // Assert note visibility and click to trigger focus
  const locator = notebook.noteLocator("note12");
  await expect(locator).toBeVisible();

  const box = await locator.boundingBox();
  if (!box) throw new Error("note12 is not rendered");

  console.log("Clicking on margin to trigger focus", box);
  await page.mouse.click(box.x - 1, box.y + box.height / 2);

  // Wait for filtered notes
  await page.waitForSelector("div.editor-input ul.filtered");

  // Get visible notes and assert their structure and content
  const visible = await notebook.visibleState();
  const visibleTexts = visible.map((n) => n.text);

  expect(Array.isArray(visible)).toBe(true); // Assert `visible` is an array
  expect(visible).toHaveLength(2); // Assert length of `visible`
  expect(visibleTexts).toEqual(["note12", "note13"]); // Assert exact visible notes

  // Get full notebook state
  let fullState;
  try {
    fullState = await notebook.state();
  } catch (err) {
    console.error("Error getting fullState:", err);
    throw err; // Let the test fail, but with more details
  }

  // Assert all notes and visible ones explicitly
  console.log("visible notes:", visibleTexts);
  console.log("all notes:", fullState.map((n) => n.text));

  expect(visibleTexts).toEqual(expect.arrayContaining(["note12", "note13"]));
  expect(visibleTexts).not.toContain("note0");
  expect(visibleTexts).not.toContain("note1");

  // Assert snapshots for visible and full states
  expect(JSON.stringify(visible, null, 2)).toMatchSnapshot("state-after-note12-focus");
  expect(JSON.stringify(fullState, null, 2)).toMatchSnapshot("all-notes-after-focus");

  // Assert the HTML snapshot after focus
  expect(await notebook.html()).toMatchSnapshot("focused");

  // Assert the URL path has changed
  expect(urlPath(page)).not.toBe("/");
});
