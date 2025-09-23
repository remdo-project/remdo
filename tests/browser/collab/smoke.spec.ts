import { expect, Page } from "@playwright/test";
import { test } from "../common";
import { Notebook } from "../notebook/common";
import { env } from "../../../config/env.server";

test.describe("collaboration", () => {
  test.skip(!env.FORCE_WEBSOCKET, "Collaboration smoke tests require FORCE_WEBSOCKET=true");

  test("synchronizes edits across peers", async ({ page }, testInfo) => {
    type PageWithScreenshot = Page & {
      takeScreenshot?: (name?: string) => Promise<void>;
    };

    const documentId = "collab-smoke";
    const basePath = `/?debug=true&documentID=${documentId}`;

    const primary = new Notebook(page);
    await page.goto(basePath);
    await page.waitForLoadState("networkidle");
    await primary.locator().focus();

    const peerPage = await page.context().newPage();
    await peerPage.goto(basePath);
    await peerPage.waitForLoadState("networkidle");
    const peer = new Notebook(peerPage);
    await peer.locator().focus();

    // Load shared content on the primary editor only.
    await primary.load("basic");

    // Ensure the peer page joins the collaboration session before we start editing.
    await peerPage.evaluate(async () => {
      await window.remdoTest?.waitForCollaborationReady?.();
    });

    await primary.clickEndOfNote("note0");
    await page.keyboard.type(" shared edit");
    await page.keyboard.press("Enter");
    await page.keyboard.type("collaboration works");

    const expectedHtml = await primary.html();

    await expect
      .poll(async () => await peer.html(), { timeout: 10_000 })
      .toEqual(expectedHtml);

    await (page as PageWithScreenshot).takeScreenshot?.("primary-after-sync");

    const peerWithScreenshot = peerPage as PageWithScreenshot;
    peerWithScreenshot.takeScreenshot = async (name) => {
      const screenshot = await peerPage.screenshot();
      await testInfo.attach(
        `peer-${name ?? "after-sync"}.png`,
        { body: screenshot, contentType: "image/png" }
      );
    };

    try {
      await peerWithScreenshot.takeScreenshot("after-sync");
    } finally {
      delete peerWithScreenshot.takeScreenshot;
    }
  });
});
