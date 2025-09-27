import { test as base } from "../common";
import { Page, Locator } from "@playwright/test";
import fs from "fs";
import prettier from "prettier";
import { getDataPath } from "tests/common.js";
import { env } from "#env";

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
        remdoTest?: {
          replaceDocument(json: unknown): Promise<void>;
          waitForCollaborationReady?(timeoutMs?: number): Promise<void>;
          openQuickMenuFromSelection?(): Promise<void>;
        };
      }).remdoTest;

      if (!api?.replaceDocument) {
        throw new Error("remdoTest.replaceDocument is not available in this build");
      }

      await api.replaceDocument(editorState);
    }, payload);

    await this.locator().focus();
    await this.waitForCollaborationReady();
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
    await this.performSelectionAction(() => this.noteLocator(title).selectText());
  }

  /** Places cursor at the very end of a given note's title */
  async clickEndOfNote(title: string) {
    await this.performSelectionAction(() => this.noteLocator(title).selectText());
    await this.performSelectionAction(() => this.page.keyboard.press("ArrowRight"));
  }

  async clickBeginningOfNote(title: string) {
    await this.performSelectionAction(() => this.noteLocator(title).selectText());
    await this.performSelectionAction(() => this.page.keyboard.press("ArrowLeft"));
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

  async clickLeftOf(title: string, minimumMargin = 4) {
    const locator = this.noteLocator(title);
    await locator.waitFor({ state: "visible" });
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error(`Bounding box not found for note "${title}"`);
    }
    const margin = Math.max(0, minimumMargin);
    const x = Math.max(0, box.x - margin);
    const y = box.y + box.height / 2;
    await this.page.mouse.click(x, y);
  }

  private async performSelectionAction(action: () => Promise<unknown>) {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await waitForSelectionChange(this.page, async () => {
          await action();
        });
        return;
      } catch (error) {
        lastError = error;
        if (!isDetachedError(error) || attempt === maxAttempts - 1) {
          throw error;
        }
        await this.page.waitForTimeout(50 * (attempt + 1));
      }
    }
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error("performSelectionAction failed without an Error instance");
  }

  private async waitForCollaborationReady() {
    await this.page.evaluate(async () => {
      await window.remdoTest?.waitForCollaborationReady?.();
    });
  }
}

class Menu {
  constructor(
    private readonly page: Page,
    private readonly notebook: Notebook
  ) { }

  private async waitForQuickMenuHidden() {
    await this.page.waitForFunction(() => {
      const menu = document.querySelector<HTMLUListElement>("#quick-menu");
      if (!menu) {
        return true;
      }
      const style = window.getComputedStyle(menu);
      const hiddenAttr = menu.getAttribute("hidden");
      return (
        style.display === "none" ||
        style.visibility === "hidden" ||
        hiddenAttr === "" ||
        hiddenAttr === "true" ||
        menu.childElementCount === 0
      );
    });
  }

  private async waitForQuickMenuShown() {
    await this.page.waitForFunction(() => {
      const menu = document.querySelector<HTMLUListElement>("#quick-menu");
      if (!menu) {
        return false;
      }
      const style = window.getComputedStyle(menu);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        menu.childElementCount > 0
      );
    });
  }

  locator(selector = "") {
    return this.page.locator(`#quick-menu ${selector}`.trim());
  }

  iconLocator() {
    return this.page.locator("#hovered-note-menu");
  }

  async open(noteText?: string) {
    if (noteText) {
      await this.notebook.selectNote(noteText);
    } else {
      const hasSelection = await this.page.evaluate(() => {
        const selection = window.getSelection();
        return Boolean(selection && selection.rangeCount > 0);
      });
      if (!hasSelection) {
        const notes = await this.notebook.getNotes();
        const firstNote = notes[0];
        if (firstNote) {
          await this.notebook.selectNote(firstNote);
        }
      }
    }
    await this.page.evaluate(async () => {
      await window.remdoTest?.openQuickMenuFromSelection?.();
    });
    await this.waitForQuickMenuShown();
  }

  async fold() {
    await this.page.keyboard.press("f");
    await this.waitForQuickMenuHidden();
  }

  async focus() {
    await this.page.keyboard.press("z");
    await this.waitForQuickMenuHidden();
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
    await page.waitForLoadState("networkidle")
    await notebook.locator().focus();
    await use(notebook);
  },
  menu: async ({ page, notebook }, use) => {
    await use(new Menu(page, notebook));
  },
});

function isDetachedError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.message.includes("Element is not attached to the DOM")
  );
}

export async function waitForSelectionChange(
  page: Page,
  action: () => Promise<unknown>,
  timeoutMs = 100
): Promise<boolean> {
  // Start listening before triggering the action
  const waitPromise = page.evaluate((timeoutMs) => {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: number | undefined;

      const cleanup = () => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        document.removeEventListener('selectionchange', onChange);
      };

      function onChange() {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(true); // changed within timeout
      }

      document.addEventListener('selectionchange', onChange, { once: true });
      timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(false); // timed out
      }, timeoutMs);
    });
  }, timeoutMs);

  // Perform the action that should cause a selection change
  await action();

  // Now wait for the selectionchange (or timeout)
  return await waitPromise;
}
