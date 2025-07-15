//FIXME add a test for deleting folded notes
import { test } from "./common";
import { expect } from "@playwright/test";

test("backspace at the beginning of a note", async ({ page, notebook }) => {
  //the idea is to make sure that the focused note is deleted instead of being outdented
  await notebook.load("basic");
  await notebook.selectNote("note00");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  expect(await notebook.html()).toMatchSnapshot();
});

test("backspace at the beginning of a next after a folded note", async ({
  page,
  menu,
  notebook,
}) => {
  await notebook.load("tree");
  await menu.open("note0");
  await menu.fold();
  await notebook.clickBeginningOfNote("note1");
  await page.keyboard.press("Backspace");
  expect(await notebook.html()).toMatchSnapshot();
});

test("backspace at the beginning of a folded note that's listed after another folded one", async ({
  page,
  menu,
  notebook,
}) => {
  await notebook.load("tree");
  await menu.open("note0");
  await menu.fold();
  await menu.open("note1");
  await menu.fold();
  await notebook.clickBeginningOfNote("note1");
  await page.keyboard.press("Backspace");
  expect(await notebook.html()).toMatchSnapshot();
});
