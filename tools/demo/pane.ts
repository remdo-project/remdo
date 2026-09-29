import { isDeepStrictEqual } from 'node:util';
import type { Locator, Page } from 'playwright';

export interface OutlineNote {
  text: string;
  children?: OutlineNote[];
}

/** The script's pacing knobs, in seconds at viewer-facing speed. */
export interface Pacing {
  typingSpeed: number;
  afterEachKey: number;
  keyCaption: number;
  chapterTitle: number;
  closingCard: number;
  splitScreen: number;
  shortPause: number;
  longPause: number;
  readReply: number;
  quickPreviewSpeedup: number;
}

export type PauseLength = 'short' | 'long' | number;

/** Converts pacing into waits, uniformly sped up for quick previews. */
export class Timing {
  constructor(private readonly pacing: Pacing, private readonly speedup: number) {}

  of(knob: Exclude<keyof Pacing, 'typingSpeed' | 'quickPreviewSpeedup'>): number {
    return this.ms(this.pacing[knob]);
  }

  typingDelay(): number {
    return this.ms(1 / this.pacing.typingSpeed);
  }

  pause(length: PauseLength): number {
    if (length === 'short') return this.of('shortPause');
    if (length === 'long') return this.of('longPause');
    return this.ms(length);
  }

  private ms(seconds: number): number {
    return Math.round(seconds * 1000 / this.speedup);
  }
}

const OUTLINE_TIMEOUT_MS = 15_000;

const EDITOR = '.editor-container [data-lexical-editor]';
const NOTE_ROW = `${EDITOR} li.list-item:not(.list-nested-item)`;

/** A browser tab shown in one of the stage's slots. */
export class Pane {
  constructor(readonly page: Page, private readonly timing: Timing, private readonly origin: string) {}

  async openHome(): Promise<void> {
    await this.page.goto(new URL('/', this.origin).href);
    await this.page.getByRole('heading', { name: 'Home' }).waitFor();
  }

  /** Returns to Home through the breadcrumb. */
  async goHome(): Promise<void> {
    await this.click(this.page.locator('[data-zoom-crumb="home"]'));
    await this.page.getByRole('heading', { name: 'Home' }).waitFor();
    await this.afterKey();
  }

  /** Reloads the page, as a visitor does to see documents created elsewhere. */
  async reload(): Promise<void> {
    await this.page.reload();
    await this.page.getByRole('heading', { name: 'Home' }).waitFor();
    await this.captionActions();
    await this.afterKey();
  }

  /** Opens a document by clicking its row on Home; without a title, the first one. */
  async open(title?: string): Promise<void> {
    await this.click(this.documentRow(title));
    await this.page.locator(`${EDITOR} li.list-item`).first().waitFor();
    await this.pause('short');
  }

  /** Shares a document from its Home row menu with the account at `email`; without a title, the first one. */
  async share(email: string, title?: string): Promise<void> {
    const name = title ?? await this.documentRow().innerText();
    await this.click(this.page.getByRole('button', { name: `Actions for ${name}` }).first());
    await this.afterKey();
    await this.click(this.page.getByRole('menuitem', { name: 'Share…' }));
    const dialog = this.page.getByRole('dialog');
    await this.click(dialog.getByRole('textbox', { name: 'Invite by email' }));
    await this.type(email);
    await this.click(dialog.getByRole('button', { name: 'Invite' }));
    await dialog.getByText(email).first().waitFor();
    await this.pause('short');
    await this.click(dialog.getByRole('button', { name: 'Done' }));
    await this.afterKey();
  }

  /** Puts the caret at the end of the note whose text is `text`. */
  async goTo(text: string): Promise<void> {
    await this.click(this.page.locator(NOTE_ROW).filter({ hasText: new RegExp(`^${escapeRegExp(text)}$`) }).first()
      .locator('[data-lexical-text]').last(), 'end');
    await this.press('End');
  }

  /** Checks off the note at the caret, with everything under it. */
  async check(): Promise<void> {
    await this.press('Control+Enter');
  }

  async captionActions(): Promise<void> {
    await this.page.screencast.showActions({ position: 'bottom', duration: this.timing.of('keyCaption') });
  }

  async type(text: string): Promise<void> {
    await this.page.keyboard.type(text, { delay: this.timing.typingDelay() });
    await this.afterKey();
  }

  async press(key: string, times = 1): Promise<void> {
    for (let pressed = 0; pressed < times; pressed++) {
      await this.page.keyboard.press(key);
      await this.afterKey();
    }
  }

  async newNote(): Promise<void> {
    await this.press('Enter');
  }

  async indent(): Promise<void> {
    await this.press('Tab');
  }

  async outdent(): Promise<void> {
    await this.press('Shift+Tab');
  }

  /** Outdents the note at the caret until it is a top-level note. */
  async toTopLevel(): Promise<void> {
    while (await this.caretDepth() > 0) await this.outdent();
  }

  async up(times = 1): Promise<void> {
    await this.press('ArrowUp', times);
  }

  async down(times = 1): Promise<void> {
    await this.press('ArrowDown', times);
  }

  async toLineEnd(): Promise<void> {
    await this.press('End');
  }

  async toDocumentEnd(): Promise<void> {
    await this.press('Control+End');
  }

  async moveNoteUp(): Promise<void> {
    await this.press('Alt+Shift+ArrowUp');
  }

  async fold(): Promise<void> {
    await this.menu('f');
  }

  async zoomIn(): Promise<void> {
    await this.menu('z');
  }

  async zoomOut(): Promise<void> {
    await this.menu('o');
  }

  async pause(length: PauseLength): Promise<void> {
    await this.page.waitForTimeout(this.timing.pause(length));
  }

  /** Waits until the document shows exactly `outline`, written as indented lines. */
  async expect(outline: string): Promise<void> {
    const expected = parseOutline(outline);
    await waitForOutline(this.page, outline.trim(), (actual) => isDeepStrictEqual(actual, expected));
  }

  /** Waits until the document's top-level notes include `texts`, in this order. */
  async expectSteps(texts: string[]): Promise<void> {
    await waitForOutline(this.page, `top-level notes including ${JSON.stringify(texts)} in order`, (outline) => {
      let next = 0;
      for (const note of outline) if (note.text === texts[next]) next++;
      return next === texts.length;
    });
  }

  /** Waits until the note `parent` has a note `child` directly under it. */
  async expectUnder(parent: string, child: string): Promise<void> {
    await waitForOutline(this.page, `"${child}" under "${parent}"`,
      (outline) => flatten(outline).some((note) => note.text === parent && (note.children ?? []).some(({ text }) => text === child)));
  }

  async noteCount(): Promise<number> {
    return flatten(await readOutline(this.page)).length;
  }

  /** Waits until the document holds more than `count` notes. */
  async expectMoreNotesThan(count: number): Promise<void> {
    await waitForOutline(this.page, `more than ${count} notes`, (outline) => flatten(outline).length > count);
  }

  // The note menu opens on two Shift presses within 500ms. Action captions hold
  // each press for their display duration, so this sequence is captioned as one.
  private async menu(shortcut: string): Promise<void> {
    const keys = ['Shift', 'Shift', shortcut];
    await this.page.screencast.hideActions();
    await this.page.screencast.showOverlay(sequenceCaption(keys), { duration: this.timing.of('keyCaption') * keys.length });
    for (const key of keys) {
      await this.page.keyboard.press(key);
    }
    await this.captionActions();
    await this.afterKey();
  }

  // A mouse click is captioned as a click, where a locator click would caption
  // the locator itself.
  private async click(target: Locator, at: 'center' | 'end' = 'center'): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    const x = at === 'end' ? box.x + box.width - 1 : box.x + box.width / 2;
    await this.page.mouse.click(x, box.y + box.height / 2);
  }

  private documentRow(title?: string): Locator {
    const documents = this.page.getByRole('group', { name: 'Current Server', exact: true });
    return title === undefined
      ? documents.getByRole('button').filter({ hasText: /\S/ }).first()
      : documents.getByRole('button', { name: title, exact: true });
  }

  private async caretDepth(): Promise<number> {
    return this.page.evaluate(() => {
      let depth = 0;
      for (let element = getSelection()?.anchorNode?.parentElement ?? null; element; element = element.parentElement) {
        if (element.matches('li.list-nested-item')) depth++;
      }
      return depth;
    });
  }

  private async afterKey(): Promise<void> {
    await this.page.waitForTimeout(this.timing.of('afterEachKey'));
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

function flatten(outline: OutlineNote[]): OutlineNote[] {
  return outline.flatMap((note) => [note, ...flatten(note.children ?? [])]);
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parses an outline written as lines indented by two spaces per level. */
export function parseOutline(text: string): OutlineNote[] {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  const margin = Math.min(...lines.map((line) => line.length - line.trimStart().length));
  return buildOutline(lines.map((line) => ({
    text: line.trim(),
    depth: (line.length - line.trimStart().length - margin) / 2,
  })));
}

function buildOutline(rows: { text: string; depth: number }[]): OutlineNote[] {
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
  return buildOutline(rows);
}
