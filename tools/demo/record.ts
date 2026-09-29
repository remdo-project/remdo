#!/usr/bin/env tsx
import { execFile } from 'node:child_process';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import type { Browser, BrowserContext } from 'playwright';
import { chromium } from 'playwright';
import { config } from '#config';
import { resolveLocalGatewayOrigin } from '#platform/net/origins';
import type { DemoAccount } from '../lib/demo-account';
import { resetDemoAccount } from '../lib/demo-account';
import { provisionDjangoUser } from '../lib/django-user';
import { Chat } from './chat';
import type { OutlineNote } from './pane';
import { expectOutline, Pane, readOutline, Timing } from './pane';
import { pacing, script } from './script';
import { Stage, STAGE_SIZE } from './stage';

const USAGE = [
  'Usage: pnpm demo:record [--final]',
  'Records the demo video from this checkout\'s running development server (pnpm run dev) as its',
  'demo account, writing $DATA_DIR/demo/demo.mp4 and its poster demo.jpg with ffmpeg. The Claude',
  'chapter runs the signed-in `claude` CLI. Without --final, the recording runs at a fast pace with',
  'a quick encode for iterating on it.',
].join('\n');
// Development-only accounts, so recording leaves the development user's documents alone.
const ACCOUNT: DemoAccount = { email: 'demo@example.test', password: 'demo-password-1234' };
const TEAMMATE: DemoAccount = { email: 'ben@example.test', password: 'ben-password-1234' };

async function signIn(browser: Browser, origin: string, account: DemoAccount): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: STAGE_SIZE, locale: 'en-US' });
  // The app's own dev-tools switch hides development-only surfaces, as in
  // production; the switch itself, also development-only, is hidden by style.
  await context.addInitScript(() => {
    localStorage.setItem('remdo-dev-tooling-visible', 'false');
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.dev-visibility-toggle { display: none !important; }';
      document.head.append(style);
    });
  });
  const configUrl = new URL('/api/config', origin).href;
  const { csrfToken } = await (await context.request.get(configUrl, { failOnStatusCode: true })).json() as { csrfToken: string };
  await context.request.post(new URL('/api/auth/browser/v1/auth/login', origin).href, {
    data: account,
    headers: { 'X-CSRFToken': csrfToken, Origin: origin },
    failOnStatusCode: true,
  });
  return context;
}

// A fresh context has no local copy, so the outline it shows comes from the server.
async function confirmStoredOutline(browser: Browser, context: BrowserContext, documentUrl: string, expected: OutlineNote[]): Promise<void> {
  const fresh = await browser.newContext({ viewport: STAGE_SIZE, storageState: await context.storageState() });
  try {
    const page = await fresh.newPage();
    await page.goto(documentUrl);
    await expectOutline(page, expected);
  } finally {
    await fresh.close();
  }
}

const run = promisify(execFile);

async function mcpToken(email: string): Promise<string> {
  const { stdout } = await run('./tools/django.sh', ['create_delegated_token', email]);
  return stdout.trim();
}

async function ffmpeg(...args: string[]): Promise<void> {
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
}

// H.264 in MP4 with its index first plays everywhere and starts before the
// download completes.
async function encodeForWeb(recording: string, preset: string, video: string): Promise<void> {
  await ffmpeg('-i', recording, '-c:v', 'libx264', '-preset', preset, '-crf', '22',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '-f', 'mp4', video);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const final = args.includes('--final');
  if (args.some((arg) => arg !== '--final')) {
    throw new Error(USAGE);
  }
  const timing = new Timing(pacing, final ? 1 : pacing.quickPreviewSpeedup);
  const preset = final ? 'slow' : 'veryfast';
  // A loopback address is a secure context, which RemDo's local offline copy
  // needs; the public development name is plain HTTP and shows it degraded.
  const origin = resolveLocalGatewayOrigin();
  await fetch(new URL('/api/health', origin)).catch(() => {
    throw new Error(`No development server answers at ${origin}; start it with pnpm run dev.`);
  });

  const outputDir = path.join(config.env.DATA_DIR, 'demo');
  const recording = path.join(outputDir, 'recording.webm');
  const video = path.join(outputDir, 'demo.mp4');
  const poster = path.join(outputDir, 'demo.jpg');
  const partials = [`${video}.partial`, `${poster}.partial`] as const;
  await mkdir(outputDir, { recursive: true });
  await run('ffmpeg', ['-version']).catch(() => {
    throw new Error('ffmpeg with libx264 must be on PATH.');
  });

  await provisionDjangoUser({ ...ACCOUNT, name: 'Demo' });
  await provisionDjangoUser({ ...TEAMMATE, name: 'Ben' });
  const mcp = { url: new URL('/mcp', origin).href, token: await mcpToken(ACCOUNT.email) };
  await resetDemoAccount(origin, ACCOUNT, { emptyDocument: 'Demo video' });
  await resetDemoAccount(origin, TEAMMATE, { emptyDocument: false });
  const browser = await chromium.launch();
  try {
    const context = await signIn(browser, origin, ACCOUNT);
    const main = new Pane(await context.newPage(), timing, origin);
    const chatPane = new Pane(await context.newPage(), timing, origin);
    const ben = new Pane(await (await signIn(browser, origin, TEAMMATE)).newPage(), timing, origin);
    await main.openHome();
    await main.open('Demo video');
    await ben.openHome();
    const stage = await Stage.open(browser, timing);
    await stage.show('main', main);
    await main.captionActions();
    await ben.captionActions();

    const chat = new Chat(chatPane, mcp);
    await stage.page.screencast.start({ path: recording, size: STAGE_SIZE });
    try {
      await script({
        main,
        ben,
        chat,
        chapter: async (title, description) => stage.chapter(title, description),
        closingCard: async (title, description) => {
          await stage.page.screenshot({ path: partials[1], type: 'jpeg', quality: 85 });
          await stage.closingCard(title, description);
        },
        split: async (pane) => stage.split(pane instanceof Chat ? pane.pane : pane),
        unsplit: async () => stage.unsplit(),
        pause: async (length) => main.pause(length),
      });
    } catch (error) {
      const panes = { main: main.page, ben: ben.page, chat: chatPane.page, stage: stage.page };
      await Promise.all(Object.entries(panes).map(async ([name, page]) =>
        page.screenshot({ path: path.join(outputDir, `failure-${name}.png`) }).catch(() => {})));
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nScreenshots of each tab: ${outputDir}/failure-*.png`);
    } finally {
      await stage.page.screencast.stop();
      await chat.close();
    }
    await confirmStoredOutline(browser, context, main.page.url(), await readOutline(main.page));
    await encodeForWeb(recording, preset, partials[0]);
    await rename(partials[0], video);
    await rename(partials[1], poster);
    console.info(`Recorded ${video} and ${poster}`);
    if (!final) {
      console.info('This quick recording runs faster than viewers can follow; record with --final to publish.');
    }
  } finally {
    await browser.close();
    await Promise.all([recording, ...partials].map(async (file) => rm(file, { force: true })));
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
