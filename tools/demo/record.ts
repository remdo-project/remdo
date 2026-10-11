#!/usr/bin/env tsx
import { execFile } from 'node:child_process';
import { mkdir, rename, rm } from 'node:fs/promises';
import process from 'node:process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { config } from '#config';
import { resolveLocalGatewayOrigin } from '../lib/origins';
import { Timing } from './pane';
import { recordingOptions, recordingPaths, USAGE } from './scenario';
import { pacing } from './script';
import { Stage, STAGE_SIZE } from './stage';

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
  if (args.length === 1 && args[0] === '--help') {
    console.info(USAGE);
    return;
  }
  const { scenario, final } = recordingOptions(args);
  const timing = new Timing(pacing, final ? 1 : pacing.quickPreviewSpeedup);
  const preset = final ? 'slow' : 'veryfast';
  // A loopback address is a secure context, which RemDo's local offline copy
  // needs; the public development name is plain HTTP and shows it degraded.
  const origin = resolveLocalGatewayOrigin();
  await fetch(new URL('/api/health', origin)).catch(() => {
    throw new Error(`No development server answers at ${origin}; start it with pnpm run dev.`);
  });

  const paths = recordingPaths(config.env.DATA_DIR, scenario);
  await mkdir(paths.directory, { recursive: true });
  await run('ffmpeg', ['-version']).catch(() => {
    throw new Error('ffmpeg with libx264 must be on PATH.');
  });

  const browser = await chromium.launch();
  try {
    const { prepare } = scenario === 'demo' ? await import('./demo') : await import('./openai-plugin');
    const scene = await prepare(browser, timing, origin);
    try {
      const stage = await Stage.open(browser, timing);
      await stage.show('main', scene.main);
      await stage.page.screencast.start({ path: paths.recording, size: STAGE_SIZE });
      try {
        await scene.play({
          chapter: async (title, description) => {
            console.info(`[${scenario}] ${title}`);
            await stage.chapter(title, description);
          },
          closingCard: async (title, description) => {
            await stage.page.screenshot({ path: paths.partialPoster, type: 'jpeg', quality: 85 });
            await stage.closingCard(title, description);
          },
          split: async (pane) => stage.split(pane),
          unsplit: async () => stage.unsplit(),
          pause: async (length) => scene.main.pause(length),
        });
      } catch (error) {
        const panes = Object.fromEntries(Object.entries(scene.panes).map(([name, pane]) => [name, pane.page]));
        panes.stage = stage.page;
        await Promise.all(Object.entries(panes).map(async ([name, page]) =>
          page.screenshot({ path: paths.failure(name) }).catch(() => {})));
        throw new Error(`${error instanceof Error ? error.message : String(error)}\nScreenshots: ${paths.directory}/${scenario}-failure-*.png`);
      } finally {
        await stage.page.screencast.stop();
      }
      await scene.verify();
    } finally {
      await scene.close();
    }
    await encodeForWeb(paths.recording, preset, paths.partialVideo);
    await rename(paths.partialVideo, paths.video);
    await rename(paths.partialPoster, paths.poster);
    console.info(`Recorded ${paths.video} and ${paths.poster}`);
    if (!final) {
      console.info('This quick recording runs faster than viewers can follow; record with --final to publish.');
    }
  } finally {
    await browser.close();
    await Promise.all([paths.recording, paths.partialVideo, paths.partialPoster].map(async (file) => rm(file, { force: true })));
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
