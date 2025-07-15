import { test } from "./common";
import { Page, expect } from "@playwright/test";

function urlPath(page: Page) {
  return new URL(page.url()).pathname;
}

function breadcrumbs(page: Page) {
  return page.locator("li.breadcrumb-item").allTextContents();
}

test("focus on a particular note", async ({ page, notebook }) => {
  await notebook.load("tree_complex");

  expect(urlPath(page)).toBe("/");
  //check breadcrumbs
  await expect(page.locator("li.breadcrumb-item")).toHaveCount(2);
  await expect(page.locator("li.breadcrumb-item").nth(1)).toContainText("main");


  expect(await notebook.html()).toMatchSnapshot("unfocused");

  //focus on note12 and make sure that only it and it's child are visible
  //playwright locators don't support ::before pseudo element, so this is a workaround to click it
  const noteBox = (await notebook.noteLocator("note12").boundingBox())!;
  await page.mouse.click(noteBox.x - 1, noteBox.y + noteBox.height / 2);

  //focus is an async event, so let's wait until root note is filtered
  await page.waitForSelector("div.editor-input ul.filtered");

  expect(await notebook.html()).toMatchSnapshot("focused");
  expect(urlPath(page)).not.toBe("/"); //TODO can be more specific once note ID is implemented
  //check breadcrumbs after changing root
  expect(await breadcrumbs(page))
    .toEqual(['Documents', 'main', 'note1', 'note12']);
  await expect(page.locator("li.breadcrumb-item.active")).toContainText(
    "note12"
  );

  //focus on note1
  const note1Breadcrumb = page.locator("li.breadcrumb-item a").nth(2);
  expect(await note1Breadcrumb.innerText()).toBe("note1");
  await note1Breadcrumb.click();
  expect(await breadcrumbs(page)).toEqual(['Documents', 'main', 'note1']);

  //go back to the root element
  const rootBreadcrumb = page.locator("li.breadcrumb-item a").nth(1);
  await rootBreadcrumb.click();
  await notebook.noteLocator("note12").waitFor();
  expect(await notebook.html()).toMatchSnapshot("unfocused");
  expect(urlPath(page)).toBe("/");
  expect(await breadcrumbs(page))
    .toEqual(['Documents', 'main']);
});

test.fixme("reload", async ({ page, notebook }) => {
  await notebook.load("tree_complex");

  expect(urlPath(page)).toBe("/");
  //check breadcrumbs
  await expect(page.locator("li.breadcrumb-item")).toHaveCount(2);
  await expect(page.locator("li.breadcrumb-item").nth(1)).toContainText("main");

  await page.reload();
});

