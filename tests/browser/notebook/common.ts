import { test as base } from "../common";
import { Page, Locator } from "@playwright/test";
import fs from "fs";
import prettier from "prettier";
import { getDataPath } from "tests/common.js";

export class Notebook {
  constructor(private readonly page: Page) {}

  locator(selector = ""): Locator {
    const editorSelector = ".editor-input" + (selector ? " " + selector : "");
    return this.page.locator(editorSelector);
  }

  noteLocator(title: string): Locator {
    return this.locator(`li span:text-is('${title}')`);
  }

  async load(file: string) {
    await this.page.click("text=Load State");
    const dataPath = getDataPath(file);
    const serializedEditorState = fs.readFileSync(dataPath).toString();
    await this.page.locator("#editor-state").fill(serializedEditorState);
    await this.page.click("text=Submit Editor State");
    await this.page.click("text=Load State");
    await this.locator().focus();

    // FIXME: wait for Lexical to fully update the editor.
    // Consider improving the whole loading mechanism, see:
    // https://lexical.dev/docs/intro
    await this.page.waitForTimeout(200);
  }

  /**
   * Returns the HTML content of the editor, formatted for stable comparison.
   * Use in tests where HTML output is the expected value.
   */
  async html() {
    return (
      await prettier.format(await this.locator().innerHTML(), {
        parser: "html",
        plugins: ["prettier-plugin-organize-attributes"],
        attributeSort: "ASC",
      })
    ).trim();
  }

  async selectNote(title: string) {
    await this.noteLocator(title).selectText();

    // Give Lexical time to visually reflect the selection
    await this.page.waitForTimeout(200);
  }

  /** Places cursor at the very end of a given note's title */
  async clickEndOfNote(title: string) {
    const noteLocator = this.noteLocator(title);
    const { width, height } = await noteLocator.boundingBox();
    await noteLocator.click({
      position: { x: width - 1, y: height - 1 }, // bottom-right corner = end of text
    });
  }

  async clickBeginningOfNote(title: string) {
    const noteLocator = this.noteLocator(title);
    await noteLocator.click({ position: { x: 1, y: 1 } });
  }

  async getNotes() {
    const result: string[] = [];
    for (const notes of await this.locator("span").all()) {
      const text = await notes.textContent();
      if (await notes.isVisible() && text) {
        result.push(text);
      }
    }
    return result;
  }
}

class Menu {
  constructor(
    private readonly page: Page,
    private readonly notebook: Notebook
  ) {}

  locator(selector = "") {
    return this.page.locator(`#quick-menu ${selector}`.trim());
  }

  iconLocator() {
    return this.page.locator("#hovered-note-menu");
  }

  async open(noteText?: string) {
    if (noteText) {
      await this.notebook.noteLocator(noteText).selectText();
    }
    await this.page.waitForTimeout(20);
    await this.page.keyboard.press("Shift");
    await this.page.waitForTimeout(20);
    await this.page.keyboard.press("Shift");
    await this.page.waitForTimeout(20);
  }

  async fold() {
    await this.page.keyboard.press("f");
    await this.page.waitForTimeout(20);
  }

  async focus() {
    await this.page.keyboard.press("z");
    await this.page.waitForTimeout(20);
  }
}

export const test = base.extend<{
  notebook: Notebook;
  urlPath: string;
  takeScreenshot: (name?: string, page?: Page) => Promise<void>;
  menu: Menu;
}>({
  urlPath: async ({}, use) => {
    await use("");
  },
  notebook: async ({ baseURL, urlPath, page }, use) => {
    const notebook = new Notebook(page);
    const baseUrlObj = new URL(baseURL ?? "");
    if (urlPath) {
      baseUrlObj.pathname = urlPath;
    }
    await page.goto(baseUrlObj.toString());
    await notebook.locator().focus();
    await use(notebook);
  },
  takeScreenshot: async ({ page }, use, testInfo) => {
    let i = 0;
    await use(async (name?: string, page_?: Page) => {
      const screenshot = await (page_ ?? page).screenshot();
      await testInfo.attach(
        `screenshot-${i++}${name ? "-" + name : ""}.png`,
        { body: screenshot, contentType: "image/png" }
      );
    });
  },
  menu: async ({ page, notebook }, use) => {
    await use(new Menu(page, notebook));
  },
});
