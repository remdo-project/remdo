import { test } from "./common";
import { expect } from "@playwright/test";

test("indent outdent", async ({ page, notebook }) => {
  await notebook.load("flat");

  expect(await notebook.html()).toMatchSnapshot("flat");

  await notebook.selectNote("note2");

  //indent
  await page.keyboard.press("Tab");

  expect(await notebook.html()).toMatchSnapshot("indented");

  //indent second time the same note with no effect
  await page.keyboard.press("Tab");
  expect(await notebook.html()).toMatchSnapshot("indented");

  //outdent
  await page.keyboard.press("Shift+Tab");
  expect(await notebook.html()).toMatchSnapshot("flat");

  //outdent second time with no effect
  await page.keyboard.press("Shift+Tab");
  expect(await notebook.html()).toMatchSnapshot("flat");
});

test("indent outdent with children", async ({ page, notebook }) => {
  await notebook.load("tree_complex");

  expect(await notebook.html()).toMatchSnapshot("base");

  await notebook.selectNote("note1");

  //indent and make note1 sibling of note01
  await page.keyboard.press("Tab");
  expect(await notebook.html()).toMatchSnapshot("indented once");

  //indent one more time and make note1 a child of note01
  await page.keyboard.press("Tab");
  expect(await notebook.html()).toMatchSnapshot("indented twice");

  //outdent
  await page.keyboard.press("Shift+Tab");
  expect(await notebook.html()).toMatchSnapshot("indented once");

  //outdent for the second time to get back to the base state
  await page.keyboard.press("Shift+Tab");
  expect(await notebook.html()).toMatchSnapshot("base");
});

test("tab not at the beginning", async ({ page, notebook }) => {
  await notebook.load("flat");
  await notebook.clickEndOfNote("note1");
  expect(await notebook.html()).toMatchSnapshot("note1 indented");
  await page.keyboard.press("Tab");
  await notebook.clickEndOfNote("note2");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Tab");
  expect(await notebook.html()).toMatchSnapshot("note2 indented");
});

