import path from 'node:path';
import type { Pane, PauseLength } from './pane';

export const USAGE = [
  'Usage: pnpm demo:record [demo|openai-plugin] [--final]',
  'Records a scenario from this checkout\'s running development server (pnpm run dev).',
  'Requires Playwright Chromium, ffmpeg with libx264, and a signed-in CLI:',
  'claude for demo; codex for openai-plugin.',
  'The default demo writes $DATA_DIR/demo/demo.mp4 and demo.jpg; openai-plugin writes',
  '$DATA_DIR/demo/openai-plugin.mp4 and openai-plugin.jpg.',
  'Omit --final for a fast preview; add --final for viewer-facing pacing.',
  'For OpenAI review, upload the plugin video manually to demo_recording_url in',
  'plugins/openai/plugin.json. Rebuild the ZIP after manifest edits with pnpm run dev:openai-plugin.',
].join('\n');

export type ScenarioName = 'demo' | 'openai-plugin';

export function recordingOptions(args: string[]): { scenario: ScenarioName; final: boolean } {
  const names = args.filter((arg) => arg !== '--final');
  const scenario = names[0] ?? 'demo';
  if (names.length > 1 || (scenario !== 'demo' && scenario !== 'openai-plugin')) {
    throw new Error(USAGE);
  }
  return { scenario, final: args.includes('--final') };
}

export function recordingPaths(dataDir: string, scenario: ScenarioName) {
  const directory = path.join(dataDir, 'demo');
  const video = path.join(directory, `${scenario}.mp4`);
  const poster = path.join(directory, `${scenario}.jpg`);
  return {
    directory,
    video,
    poster,
    recording: path.join(directory, `${scenario}-recording.webm`),
    partialVideo: `${video}.partial`,
    partialPoster: `${poster}.partial`,
    failure: (pane: string) => path.join(directory, `${scenario}-failure-${pane}.png`),
  };
}

export interface Presentation {
  chapter: (title: string, description: string) => Promise<void>;
  closingCard: (title: string, description: string) => Promise<void>;
  split: (pane: Pane) => Promise<void>;
  unsplit: () => Promise<void>;
  pause: (length: PauseLength) => Promise<void>;
}

export interface Scene {
  main: Pane;
  panes: Record<string, Pane>;
  play: (presentation: Presentation) => Promise<void>;
  verify: () => Promise<void>;
  close: () => Promise<void>;
}
