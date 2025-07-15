import { test } from "./common";
import { expect } from "@playwright/test";

test("menu icon follows selection", async ({ menu, notebook }) => {
  await notebook.load("flat");

  const note = notebook.noteLocator("note2");
  await note.selectText();

  const noteBB = await note.boundingBox();
  const menuIconBB = await menu.iconLocator().boundingBox();
  const menuIconCenter = menuIconBB.y + menuIconBB.height / 2;

  //check if the center of the menu icon is somewhere between top and bottom of the selected note
  expect(menuIconCenter).toBeGreaterThanOrEqual(noteBB.y);
  expect(menuIconCenter).toBeLessThanOrEqual(noteBB.y + noteBB.height);
});

test("open menu by mouse", async ({ menu, notebook }) => {
  await notebook.load("flat");

  await expect(menu.locator()).not.toBeVisible();
  await menu.iconLocator().click();

  //menu is shown and has some options
  await expect(menu.locator()).toBeVisible();
  expect(await menu.locator("li").count()).toBeGreaterThan(0);

  await notebook.locator().click();
  await expect(menu.locator()).not.toBeVisible();
});

test("open menu by keyboard", async ({ menu, notebook }) => {
  await notebook.load("flat");
  await menu.open();

  //menu is shown and has some options
  await expect(menu.locator()).toBeVisible();
  expect(await menu.locator("li").count()).toBeGreaterThan(0);
});

test("trigger option by arrow", async ({ notebook, menu, page }) => {
  await notebook.load("tree");
  await menu.open();

  const optionsLocator = menu.locator("li.list-group-item");
  const activeOptionLocator = menu.locator("li.list-group-item.active");

  await expect(optionsLocator).not.toHaveCount(0);
  await expect(activeOptionLocator).not.toBeVisible();

  await page.keyboard.press("ArrowDown");
  await expect(activeOptionLocator).toBeVisible();
  await expect(activeOptionLocator).toContainText("Fold");

  await page.keyboard.press("Enter");
  expect(await notebook.html()).toMatchSnapshot();
});

test("trigger option by hot key", async ({ page, notebook, menu }) => {
  await notebook.load("tree");

  expect(await notebook.html()).toMatchSnapshot("unfolded");

  await menu.open();
  await page.keyboard.press("f"); //toggle fold
  expect(await notebook.html()).toMatchSnapshot("folded");

  await menu.open();
  await page.keyboard.press("f"); //toggle fold
  expect(await notebook.html()).toMatchSnapshot("unfolded");
});

test("trigger option by click", async ({ menu, notebook }) => {
  await notebook.load("tree");
  await menu.open();
  await menu.locator("button :text('Fold')").click();
  expect(await notebook.html()).toMatchSnapshot();
});

test("arrows + hot key", async ({ notebook, menu, page }) => {
  await notebook.load("tree");
  await menu.open();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");

  await page.keyboard.press("f"); //fold
  expect(await notebook.html()).toMatchSnapshot();
});

test("esc", async ({ notebook, menu, page }) => {
  await notebook.load("tree");
  await menu.open();

  await expect(menu.locator()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu.locator()).not.toBeVisible();
});

test("backspace", async ({ notebook, menu, page }) => {
  await notebook.load("tree");
  await menu.open();

  await expect(menu.locator()).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(menu.locator()).not.toBeVisible();
});

test("invalid hot key", async ({ notebook, menu, page }) => {
  await notebook.load("tree");
  await menu.open();

  await expect(menu.locator()).toBeVisible();
  await page.keyboard.press("$");
  await expect(menu.locator()).not.toBeVisible();
});

test("open and click outside of editor", async ({ page, notebook, menu }) => {
  await notebook.load("tree");

  await menu.open();

  //menu is shown and has some options
  await expect(menu.locator()).toBeVisible();
  expect(await menu.locator("li").count()).toBeGreaterThan(0);

  await page.locator("body").click();

  //menu is closed
  await expect(menu.locator()).not.toBeVisible();
});
