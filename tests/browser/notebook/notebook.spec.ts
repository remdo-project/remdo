import { test } from "./common";
import { expect } from "@playwright/test";

test("load editor state", async ({ notebook }) => {
  await notebook.load("basic");
  expect(await notebook.html()).toMatchSnapshot();
});

test("clear content", async ({ page, notebook }) => {
  await page.locator("text=Clear").click();
  expect(await notebook.html()).toMatchSnapshot();
});
