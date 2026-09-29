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
import { Chat } from './chat';
import type { OutlineNote } from './pane';
import { expectOutline, Pane, readOutline, Timing } from './pane';
import { pacing, script } from './script';
import { Stage, STAGE_SIZE } from './stage';

const USAGE = [
  'Usage: pnpm demo:record [--final] [origin]',
  'Resets the origin\'s user account, whose password REMDO_USER_PASSWORD holds, then records',
  'the demo video to $DATA_DIR/demo/demo.mp4 with its poster demo.jpg, encoding them with ffmpeg.',
  'Without --final, the recording runs at a fast pace with a quick encode for iterating on it.',
  'The Claude chapter runs the signed-in `claude` CLI against the origin\'s MCP server; REMDO_MCP_TOKEN',
  'supplies its delegated access token, which a local development origin mints itself.',
  'The origin defaults to https://remdo.com.',
].join('\n');

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
async function confirmStoredOutline(browser: Browser, context: BrowserContext, documentUrl: string, expected: OutlineNote[]): Promise<void> {
  const fresh = await browser.newContext({ viewport: STAGE_SIZE, storageState: await context.storageState() });
  try {
    const pane = new Pane(await fresh.newPage(), new Timing(pacing, 1), documentUrl);
    await pane.openDocument();
    await expectOutline(pane.page, expected);
  } finally {
    await fresh.close();
  }
}

const run = promisify(execFile);

// Development instances mint the token directly; other targets need a real
// delegated grant, which the recorder cannot obtain yet.
async function mcpToken(origin: string, email: string): Promise<string> {
  // eslint-disable-next-line node/no-process-env -- a delegated credential, absent from the development config schema.
  const supplied = process.env.REMDO_MCP_TOKEN;
  if (supplied) return supplied;
  const url = new URL(origin);
  if (url.protocol !== 'http:' || url.port !== String(config.env.PORT)) {
    throw new Error('REMDO_MCP_TOKEN must hold a delegated access token for the target\'s MCP server.');
  }
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
  const [originArgument = 'https://remdo.com', ...extra] = args.filter((arg) => arg !== '--final');
  if (extra.length > 0 || originArgument.startsWith('-')) {
    throw new Error(USAGE);
  }
  const timing = new Timing(pacing, final ? 1 : pacing.quickPreviewSpeedup);
  const preset = final ? 'slow' : 'veryfast';
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

  const mcp = { url: new URL('/mcp', origin).href, token: await mcpToken(origin, account.email) };
  const { document } = await resetDemoAccount(origin, account);
  const browser = await chromium.launch();
  try {
    const context = await signIn(browser, origin, account);
    const documentUrl = new URL(`/n/${document.id}`, origin).href;
    const main = new Pane(await context.newPage(), timing, documentUrl);
    const other = new Pane(await context.newPage(), timing, documentUrl);
    await main.openDocument();
    const stage = await Stage.open(browser, timing);
    await stage.show('main', main);
    await stage.show('extra', other);
    await main.captionActions();
    await other.captionActions();

    await stage.page.screencast.start({ path: recording, size: STAGE_SIZE });
    try {
      await script({
        main,
        other,
        chat: new Chat(other, mcp),
        chapter: async (title, description) => stage.chapter(title, description),
        split: async () => stage.split(main, other),
        unsplit: async () => stage.unsplit(main),
        pause: async (length) => main.pause(length),
      });
      await stage.page.screenshot({ path: partials[1], type: 'jpeg', quality: 85 });
    } finally {
      await stage.page.screencast.stop();
    }
    await confirmStoredOutline(browser, context, documentUrl, await readOutline(main.page));
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
