import { test } from "./common";
import { expect } from "@playwright/test";

test("check/uncheck", async ({ page, notebook }) => {
  await notebook.load("single");
  expect(await notebook.html()).toMatchSnapshot("base");
  await notebook.clickEndOfNote("note0");

  await page.keyboard.press("Meta+Enter");
  expect(await notebook.html()).toMatchSnapshot("checked");

  await page.keyboard.press("Meta+Enter");
  expect(await notebook.html()).toMatchSnapshot("base");
});
