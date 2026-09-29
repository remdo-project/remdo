#!/usr/bin/env tsx
import { execFile } from 'node:child_process';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import type { Browser, BrowserContext } from 'playwright';
import { chromium } from 'playwright';
import { config } from '#config';
import type { DemoAccount } from '../lib/demo-account';
import { demoAccount, resetDemoAccount } from '../lib/demo-account';
import { expectOutline, Pane } from './pane';
import { CHAPTERS, FINAL_OUTLINE } from './scenario';
import { Stage, STAGE_SIZE } from './stage';

const USAGE = [
  'Usage: pnpm demo:record [--final] [origin]',
  'Resets the origin\'s user account, whose password REMDO_USER_PASSWORD holds, then records',
  'the demo video to $DATA_DIR/demo/demo.mp4 with its poster demo.jpg, encoding them with ffmpeg.',
  'Without --final, the recording runs at a fast pace with a quick encode for iterating on it.',
  'The origin defaults to https://remdo.com.',
].join('\n');
const QUICK = { pace: 0.2, preset: 'veryfast' };
const FINAL = { pace: 1, preset: 'slow' };

async function signIn(browser: Browser, origin: string, account: DemoAccount): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: STAGE_SIZE, locale: 'en-US' });
  const configUrl = new URL('/api/config', origin).href;
  const { csrfToken } = await (await context.request.get(configUrl, { failOnStatusCode: true })).json() as { csrfToken: string };
  await context.request.post(new URL('/api/auth/browser/v1/auth/login', origin).href, {
    data: account,
    // Django's HTTPS CSRF check requires a same-origin Origin or Referer.
    headers: { 'X-CSRFToken': csrfToken, Origin: origin },
    failOnStatusCode: true,
  });
  return context;
}

// A fresh context has no local copy, so the outline it shows comes from the server.
async function confirmStoredOutline(browser: Browser, context: BrowserContext, documentUrl: string): Promise<void> {
  const fresh = await browser.newContext({ viewport: STAGE_SIZE, storageState: await context.storageState() });
  try {
    const pane = new Pane(await fresh.newPage(), 1);
    await pane.openDocument(documentUrl);
    await expectOutline(pane.page, FINAL_OUTLINE);
  } finally {
    await fresh.close();
  }
}

const run = promisify(execFile);

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
  const [originArgument = 'https://remdo.com', ...extra] = args.filter((arg) => arg !== '--final');
  if (extra.length > 0 || originArgument.startsWith('-')) {
    throw new Error(USAGE);
  }
  const mode = final ? FINAL : QUICK;
  const origin = new URL(originArgument).origin;
  // eslint-disable-next-line node/no-process-env -- a deployment secret, absent from the development config schema.
  const password = process.env.REMDO_USER_PASSWORD;
  if (!password) {
    throw new Error('REMDO_USER_PASSWORD must hold the target\'s user account password.');
  }
  const account = demoAccount(origin, password);

  const outputDir = path.join(config.env.DATA_DIR, 'demo');
  const recording = path.join(outputDir, 'recording.webm');
  const video = path.join(outputDir, 'demo.mp4');
  const poster = path.join(outputDir, 'demo.jpg');
  const partials = [`${video}.partial`, `${poster}.partial`] as const;
  await mkdir(outputDir, { recursive: true });
  await run('ffmpeg', ['-version']).catch(() => {
    throw new Error('ffmpeg with libx264 must be on PATH.');
  });

  const { document } = await resetDemoAccount(origin, account);
  const browser = await chromium.launch();
  try {
    const context = await signIn(browser, origin, account);
    const documentUrl = new URL(`/n/${document.id}`, origin).href;
    const main = new Pane(await context.newPage(), mode.pace);
    const extra = new Pane(await context.newPage(), mode.pace);
    await main.openDocument(documentUrl);
    const stage = await Stage.open(browser, mode.pace);
    await stage.show('main', main);
    await stage.show('extra', extra);
    await main.captionActions();
    await extra.captionActions();

    await stage.page.screencast.start({ path: recording, size: STAGE_SIZE });
    try {
      for (const chapter of CHAPTERS) {
        await chapter({ stage, main, extra, documentUrl });
      }
      await stage.page.screenshot({ path: partials[1], type: 'jpeg', quality: 85 });
    } finally {
      await stage.page.screencast.stop();
    }
    await confirmStoredOutline(browser, context, documentUrl);
    await encodeForWeb(recording, mode.preset, partials[0]);
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
