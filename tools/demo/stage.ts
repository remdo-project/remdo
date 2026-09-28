import type { Page } from 'playwright';

export interface OutlineNote {
  text: string;
  children?: OutlineNote[];
}

export interface Chapter {
  run: (stage: Stage) => Promise<void>;
  endState: OutlineNote[];
}

const TYPING_DELAY_MS = 70;
const ACTION_PAUSE_MS = 450;
const CHAPTER_MS = 2200;

const CAPTION_MS = 500;
const SEQUENCE_CAPTION_MS = 1200;

export class Stage {
  /** `pace` scales every wait and caption duration; 1 is the viewer-facing pace. */
  constructor(readonly page: Page, private readonly pace: number) {}

  async captionActions(): Promise<void> {
    await this.page.screencast.showActions({ position: 'bottom', duration: this.paced(CAPTION_MS) });
  }

  async chapter(title: string, description?: string): Promise<void> {
    await this.page.screencast.showChapter(title, { description, duration: this.paced(CHAPTER_MS) });
    await this.page.waitForTimeout(this.paced(CHAPTER_MS));
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
