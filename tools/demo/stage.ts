import type { Browser, Page } from 'playwright';
import type { Pane, Timing } from './pane';

export const STAGE_SIZE = { width: 1280, height: 720 };
const HALF_SIZE = { width: STAGE_SIZE.width / 2, height: STAGE_SIZE.height };
const FRAME_QUALITY = 90;

export type Slot = 'main' | 'extra';

// The extra slot hugs the right edge, so its pane slides in from the side while
// the main pane's right part slides out of view; each pane then lays itself
// out for its final width.
const STAGE_HTML = `<!doctype html>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #1a1b1e; }
  #slots { display: flex; height: 100%; }
  .slot {
    position: relative; display: flex; height: 100%; overflow: hidden; flex: none;
    transition: width var(--transition) ease-in-out;
  }
  .slot img { flex: none; display: block; align-self: flex-start; }
  #extra { justify-content: flex-end; }
  #extra::before {
    content: ''; position: absolute; inset: 0 auto 0 0; width: 2px; z-index: 1; background: #4b4f58;
  }
</style>
<div id="slots">
  <div class="slot" id="main" style="width: 100%"><img alt=""></div>
  <div class="slot" id="extra" style="width: 0"><img alt=""></div>
</div>`;

interface Stream {
  latest?: string;
  flushing: boolean;
  width: number;
}

/** The recorded page, composing the panes' screencast frames into one frame. */
export class Stage {
  private readonly streams = new Map<Slot, Stream>();

  private constructor(readonly page: Page, private readonly timing: Timing) {}

  static async open(browser: Browser, timing: Timing): Promise<Stage> {
    const page = await browser.newPage({ viewport: STAGE_SIZE });
    await page.setContent(STAGE_HTML);
    await page.evaluate((ms) => document.documentElement.style.setProperty('--transition', `${ms}ms`), timing.of('splitScreen'));
    return new Stage(page, timing);
  }

  async show(slot: Slot, pane: Pane): Promise<void> {
    const stream: Stream = { flushing: false, width: 0 };
    this.streams.set(slot, stream);
    await pane.page.screencast.start({
      size: STAGE_SIZE,
      quality: FRAME_QUALITY,
      onFrame: ({ data, viewportWidth }) => {
        stream.latest = data.toString('base64');
        stream.width = viewportWidth;
        void this.flush(slot, stream);
      },
    });
    await this.frameOfWidth(slot, pane.page.viewportSize()!.width);
  }

  /** Brings the extra pane in beside the main one, each taking half the stage. */
  async split(main: Pane, extra: Pane): Promise<void> {
    await extra.page.setViewportSize(HALF_SIZE);
    await this.frameOfWidth('extra', HALF_SIZE.width);
    await this.resizeSlots('50%', '50%');
    await main.page.setViewportSize(HALF_SIZE);
    await this.frameOfWidth('main', HALF_SIZE.width);
  }

  /** Returns the whole stage to the main pane. */
  async unsplit(main: Pane): Promise<void> {
    await main.page.setViewportSize(STAGE_SIZE);
    await this.frameOfWidth('main', STAGE_SIZE.width);
    await this.resizeSlots('100%', '0');
  }

  async chapter(title: string, description?: string): Promise<void> {
    await this.page.screencast.showChapter(title, { description, duration: this.timing.of('chapterTitle') });
    await this.page.waitForTimeout(this.timing.of('chapterTitle'));
  }

  private async resizeSlots(main: string, extra: string): Promise<void> {
    await this.page.evaluate(([mainWidth, extraWidth]) => {
      document.getElementById('main')!.style.width = mainWidth!;
      document.getElementById('extra')!.style.width = extraWidth!;
    }, [main, extra]);
    await this.page.waitForTimeout(this.timing.of('splitScreen'));
  }

  // Frames are pushed one at a time and superseded ones are dropped, so a slow
  // stage never falls behind its panes.
  private async flush(slot: Slot, stream: Stream): Promise<void> {
    if (stream.flushing) return;
    stream.flushing = true;
    try {
      while (stream.latest !== undefined) {
        const frame = stream.latest;
        stream.latest = undefined;
        await this.page.evaluate(([id, jpeg]) => {
          document.querySelector<HTMLImageElement>(`#${id} img`)!.src = `data:image/jpeg;base64,${jpeg}`;
        }, [slot, frame]);
      }
    } finally {
      stream.flushing = false;
    }
  }

  private async frameOfWidth(slot: Slot, width: number): Promise<void> {
    const stream = this.streams.get(slot)!;
    while (stream.width !== width || stream.flushing || stream.latest !== undefined) {
      await this.page.waitForTimeout(50);
    }
  }
}
