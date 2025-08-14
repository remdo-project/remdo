import { test } from "./common";
import { expect } from "@playwright/test";

test("backspace at the beginning of a note", async ({ page, notebook }) => {
  await notebook.load("basic");
  await notebook.selectNote("note00");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");

  // Assert by HTML snapshot only
  expect(await notebook.html()).toMatchSnapshot("html-after-note00-delete");
});

test("backspace at the beginning of a note after a folded note", async ({ page, menu, notebook }) => {
  await notebook.load("tree");
  await menu.open("note0");
  await menu.fold();

  await notebook.clickBeginningOfNote("note1");
  await page.keyboard.press("Backspace");

  expect(await notebook.html()).toMatchSnapshot("html-after-note1-delete");
});

test("backspace at the beginning of a folded note after another folded one", async ({ page, menu, notebook }) => {
  await notebook.load("tree");
  await menu.open("note0");
  await menu.fold();
  await menu.open("note1");
  await menu.fold();

  await notebook.clickBeginningOfNote("note1");
  await page.keyboard.press("Backspace");

  expect(await notebook.html()).toMatchSnapshot("html-after-nested-folded-delete");
});

test("delete folded notes", async ({ page, notebook, menu }) => {
  await notebook.load("tree");

  await menu.open("note0");
  await menu.fold();

  await notebook.clickBeginningOfNote("note0");
  await page.keyboard.press("Backspace");

  expect(await notebook.html()).toMatchSnapshot("html-after-folded-tree-delete");
});