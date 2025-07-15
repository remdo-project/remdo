import { test } from "./common";
import { expect } from "@playwright/test";

/*
just a basic test to make sure that the key bindings work
more complex cases are checked in the unit tests
*/
test("reorder flat", async ({ page, notebook }) => {
  await notebook.load("flat");
  expect(await notebook.html()).toMatchSnapshot("base");

  await notebook.clickEndOfNote("note2");

  await page.keyboard.press("Meta+ArrowUp");
  expect(await notebook.html()).toMatchSnapshot("note2 moved up");

  await page.keyboard.press("Meta+ArrowUp");
  expect(await notebook.html()).toMatchSnapshot("note2 moved up x2");

  await page.keyboard.press("Meta+ArrowUp"); //noop
  expect(await notebook.html()).toMatchSnapshot("note2 moved up x2");

  await page.keyboard.press("Meta+ArrowDown");
  expect(await notebook.html()).toMatchSnapshot("note2 moved up");

  await page.keyboard.press("Meta+ArrowDown");
  expect(await notebook.html()).toMatchSnapshot("base");

  await page.keyboard.press("Meta+ArrowDown"); //noop
  expect(await notebook.html()).toMatchSnapshot("base");
});
