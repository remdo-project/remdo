import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";

// Exact matches
const SKIP_CONSOLE_MESSAGES = [
  "%cDownload the React DevTools for a better development experience: https://reactjs.org/link/react-devtools font-weight:bold",
  "%cDownload the React DevTools for a better development experience: https://react.dev/link/react-devtools font-weight:bold",
  "Download the React DevTools for a better development experience: https://reactjs.org/link/react-devtools",
  "[vite] connecting...",
  "[vite] connected.",
  'ArtificialNode__DO_NOT_USE should implement "exportJSON" method to ensure JSON and default HTML serialization works as expected',
  'ArtificialNode__DO_NOT_USE should implement "importJSON" method to ensure JSON and default HTML serialization works as expected',
  'ArtificialNode__DO_NOT_USE must implement static "clone" method',
];

// Substring matches (partial match)
const SKIP_CONTAINS = [
  "downloadable font: rejected by sanitizer",
];

type PageWithScreenshot = Page & {
  takeScreenshot(name?: string, page?: Page): Promise<void>;
};

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const pageWithScreenshot = page as PageWithScreenshot;
    let screenshotIndex = 0;

    pageWithScreenshot.takeScreenshot = async (name?: string) => {
      const screenshot = await page.screenshot();
      await testInfo.attach(
        `screenshot-${screenshotIndex++}${name ? "-" + name : ""}.png`,
        { body: screenshot, contentType: "image/png" }
      );
    };

    await page.addInitScript(() => {
      (window as typeof window & { REMDO_TEST?: boolean }).REMDO_TEST = true;
    });
    page.on("console", (message) => {
      const text = message.text();

      const shouldSkip =
        SKIP_CONSOLE_MESSAGES.includes(text) ||
        SKIP_CONTAINS.some((frag) => text.includes(frag));

      if (!shouldSkip) {
        console.warn("Browser:", message);
        if (["warning", "error"].includes(message.type())) {
          console.error(`${message.type} inside the browser: `);
          throw Error(text);
        }
      }
    });

    page.on("pageerror", (err) => {
      console.error("Error inside the browser: ", err.message);
      throw err;
    });

    try {
      await use(pageWithScreenshot);
    } finally {
      delete pageWithScreenshot.takeScreenshot;
    }
  },
});
