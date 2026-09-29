import { isDeepStrictEqual } from 'node:util';
import type { Page } from 'playwright';

export interface OutlineNote {
  text: string;
  children?: OutlineNote[];
}

const TYPING_DELAY_MS = 70;
const ACTION_PAUSE_MS = 450;
const CAPTION_MS = 500;
const SEQUENCE_CAPTION_MS = 1200;
const OUTLINE_TIMEOUT_MS = 15_000;

/** A browser page shown in one of the stage's slots. */
export class Pane {
  /** `pace` scales every wait and caption duration; 1 is the viewer-facing pace. */
  constructor(readonly page: Page, private readonly pace: number) {}

  async openDocument(url: string): Promise<void> {
    await this.page.goto(url);
    await this.page.locator('.editor-container [data-lexical-editor] li.list-item').first().waitFor();
    await this.page.locator('.editor-container [data-lexical-editor]').focus();
  }

  async captionActions(): Promise<void> {
    await this.page.screencast.showActions({ position: 'bottom', duration: this.paced(CAPTION_MS) });
  }

  async type(text: string): Promise<void> {
    await this.page.keyboard.type(text, { delay: this.paced(TYPING_DELAY_MS) });
    await this.pause();
  }

  async press(key: string, times = 1): Promise<void> {
    for (let pressed = 0; pressed < times; pressed++) {
      await this.page.keyboard.press(key);
      await this.pause();
    }
  }

  // Action captions hold each action for their display duration, which would
  // stretch timed key sequences such as double-Shift beyond their window.
  async sequence(keys: string[]): Promise<void> {
    await this.page.screencast.hideActions();
    await this.page.screencast.showOverlay(sequenceCaption(keys), { duration: this.paced(SEQUENCE_CAPTION_MS) });
    for (const key of keys) {
      await this.page.keyboard.press(key);
    }
    await this.captionActions();
    await this.pause();
  }

  async pause(ms = ACTION_PAUSE_MS): Promise<void> {
    await this.page.waitForTimeout(this.paced(ms));
  }

  async expectOutline(expected: OutlineNote[]): Promise<void> {
    await expectOutline(this.page, expected);
  }

  async expectOutlineWhere(description: string, holds: (outline: OutlineNote[]) => boolean): Promise<void> {
    await waitForOutline(this.page, description, holds);
  }

  private paced(ms: number): number {
    return Math.round(ms * this.pace);
  }
}

function sequenceCaption(keys: string[]): string {
  const style = [
    'position:fixed', 'left:50%', 'bottom:32px', 'transform:translateX(-50%)',
    'padding:8px 16px', 'border-radius:8px', 'background:rgba(0,0,0,.75)',
    'color:#fff', 'font:600 24px system-ui,sans-serif',
  ].join(';');
  const label = keys.map((key) => (key.length === 1 ? key.toUpperCase() : key)).join(' ');
  return `<div style="${style}">${label}</div>`;
}

export async function expectOutline(page: Page, expected: OutlineNote[]): Promise<void> {
  await waitForOutline(page, JSON.stringify(expected), (actual) => isDeepStrictEqual(actual, expected));
}

async function waitForOutline(page: Page, description: string, holds: (outline: OutlineNote[]) => boolean): Promise<void> {
  const deadline = Date.now() + OUTLINE_TIMEOUT_MS;
  let actual = await readOutline(page);
  while (!holds(actual)) {
    if (Date.now() > deadline) {
      throw new Error(`Outline not reached.\nExpected: ${description}\nActual:   ${JSON.stringify(actual)}`);
    }
    await page.waitForTimeout(250);
    actual = await readOutline(page);
  }
}

// Row depth counts the children-wrappers enclosing a row; the page function
// stays free of named inner functions, which tsx would reference as `__name`.
export async function readOutline(page: Page): Promise<OutlineNote[]> {
  const rows = await page.locator('.editor-container [data-lexical-editor] li.list-item:not(.list-nested-item)').evaluateAll(
    (items) => items.map((item) => {
      let depth = 0;
      for (let element = item.parentElement; element; element = element.parentElement) {
        if (element.matches('li.list-nested-item')) depth++;
      }
      return { text: item.textContent, depth };
    }),
  );
  const root: OutlineNote[] = [];
  const lastAtDepth: OutlineNote[] = [];
  for (const { text, depth } of rows) {
    const note: OutlineNote = { text };
    const parent = lastAtDepth[depth - 1];
    if (parent) {
      (parent.children ??= []).push(note);
    } else {
      root.push(note);
    }
    lastAtDepth[depth] = note;
  }
  return root;
}
