/* eslint-disable react-hooks/rules-of-hooks */
import { test as base } from "../common";
import { Page, Locator } from "@playwright/test";
import fs from "fs";
import prettier from "prettier";
import { getDataPath } from "tests/common.js";
import { env } from "../../../config/env.server";

function removeDataNoteId(root: HTMLElement) {
  root.querySelectorAll('[data-note-id]').forEach((el) => {
    el.removeAttribute('data-note-id');
  });
}

export class Notebook {
  constructor(private readonly page: Page) { }

  locator(selector = ""): Locator {
    const editorSelector = ".editor-input" + (selector ? " " + selector : "");
    return this.page.locator(editorSelector);
  }

  noteLocator(title: string): Locator {
    return this.locator(`li span:text-is('${title}')`);
  }

  async load(file: string) {
    const dataPath = getDataPath(file);
    const serializedEditorState = fs.readFileSync(dataPath, "utf8");
    const payload = JSON.parse(serializedEditorState);

    await this.page.evaluate(async (editorState) => {
      const api = (window as typeof window & {
        remdoTest?: { replaceDocument(json: unknown): Promise<void> };
      }).remdoTest;

      if (!api?.replaceDocument) {
        throw new Error("remdoTest.replaceDocument is not available in this build");
      }

      await api.replaceDocument(editorState);
    }, payload);

    await this.locator().focus();
  }

  /**
   * Returns the HTML content of the editor, formatted for stable comparison.
   * Use in tests where HTML output is the expected value.
   */
  async html() {
    const formatted = await this.page.evaluate(() => {
      const root = document.querySelector('.editor-input');
      if (!root) {
        return '';
      }
      const clone = root.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[data-note-id]').forEach((el) => {
        el.removeAttribute('data-note-id');
      });
      return clone.innerHTML;
    });
    return (
      await prettier.format(formatted, {
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
    await waitForSelectionChange(this.page, async () => {
      await noteLocator.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = window.getSelection();
        if (!selection) {
          return;
        }
        selection.removeAllRanges();
        selection.addRange(range);
      });
    });
  }

  async clickBeginningOfNote(title: string) {
    const noteLocator = this.noteLocator(title);
    await waitForSelectionChange(this.page, async () => {
      await noteLocator.click({ position: { x: 1, y: 1 } });
    });
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
  ) { }

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
  menu: Menu;
}>({
  notebook: async ({ page }, use) => {
    const notebook = new Notebook(page);
    await page.goto(`/?debug=true${env.FORCE_WEBSOCKET ? "" : "&ws=false"}`);
    await notebook.locator().focus();
    await use(notebook);
  },
  menu: async ({ page, notebook }, use) => {
    await use(new Menu(page, notebook));
  },
});

export async function waitForSelectionChange(
  page: Page,
  action: () => Promise<unknown>,
  timeoutMs = 100
): Promise<boolean> {
  // Start listening before triggering the action
  const waitPromise = page.evaluate((timeoutMs) => {
    return new Promise<boolean>((resolve) => {
      let settled = false;

      const onChange = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        document.removeEventListener('selectionchange', onChange);
        resolve(true); // changed within timeout
      };

      document.addEventListener('selectionchange', onChange, { once: true });
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        document.removeEventListener('selectionchange', onChange);
        resolve(false); // timed out
      }, timeoutMs);
    });
  }, timeoutMs);

  // Perform the action that should cause a selection change
  await action();

  // Now wait for the selectionchange (or timeout)
  return await waitPromise;
}
