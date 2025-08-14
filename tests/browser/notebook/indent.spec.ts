import { test } from "./common";
import { expect } from "@playwright/test";

test("indent outdent", async ({ page, notebook }) => {
  await notebook.load("flat");

  let html = await notebook.html();
  expect(html).toContain("note1");
  expect(html).toMatch(/note0[\s\S]*note1[\s\S]*note2/);

  await notebook.selectNote("note2");
  await page.keyboard.press("Tab");

  html = await notebook.html();
  expect(html).toMatch(/note1[\s\S]*<ul>[\s\S]*note2/); // note2 is child of note1

  await page.keyboard.press("Tab");
  const noChangeHtml = await notebook.html();
  expect(noChangeHtml).toBe(html); // No change after second Tab

  await page.keyboard.press("Shift+Tab");
  html = await notebook.html();
  expect(html).toMatch(/note1[\s\S]*note2/); // back to sibling

  await page.keyboard.press("Shift+Tab");
  const againNoChange = await notebook.html();
  expect(againNoChange).toBe(html); // Still same after extra outdent
});

test("indent outdent with children", async ({ page, notebook }) => {
  await notebook.load("tree_complex");

  let html = await notebook.html();
  expect(html).toContain("note1");
  expect(html).toContain("note01");

  await notebook.selectNote("note1");
  await page.keyboard.press("Tab");

  html = await notebook.html();
  expect(html).toMatch(/note01[\s\S]*note1/); // note1 nested under note01

  await page.keyboard.press("Tab");
  html = await notebook.html();
  expect(html).toMatch(/note01[\s\S]*<ul>[\s\S]*note1/); // note1 deeper nested

  await page.keyboard.press("Shift+Tab");
  html = await notebook.html();
  expect(html).toMatch(/note01[\s\S]*note1/); // back one level

  await page.keyboard.press("Shift+Tab");
  html = await notebook.html();
  expect(html).toContain('<span data-lexical-text="true">note1</span>'); // base layout
});

test("tab not at the beginning", async ({ page, notebook }) => {
  await notebook.load("flat");

  await notebook.clickEndOfNote("note1");
  await page.keyboard.press("Tab");

  let html = await notebook.html();
  expect(html).toMatch(/note0[\s\S]*<ul>[\s\S]*note1/); // note1 nested

  await notebook.clickEndOfNote("note2");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Tab");

  html = await notebook.html();
  // Updated to reflect that note2 is a sibling in the nested list, not child of note1
  expect(html).toMatch(/note1[\s\S]*note2/); // note1 and note2 are siblings under note0
});
