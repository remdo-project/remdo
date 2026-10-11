import { expect, it } from 'vitest';
import { recordingOptions, recordingPaths } from './scenario';

it('keeps the existing command and explicitly named demo on the landing video', () => {
  for (const args of [[], ['--final'], ['demo', '--final']]) {
    const options = recordingOptions(args);
    const files = recordingPaths('/recordings', options.scenario);
    expect(files.video).toBe('/recordings/demo/demo.mp4');
    expect(files.poster).toBe('/recordings/demo/demo.jpg');
    expect(options.final).toBe(args.includes('--final'));
  }
});

it('gives the plugin scenario separate media, intermediate files, and failure screenshots', () => {
  const options = recordingOptions(['--final', 'openai-plugin']);
  const files = recordingPaths('/recordings', options.scenario);
  expect(options).toEqual({ scenario: 'openai-plugin', final: true });
  expect(files.video).toBe('/recordings/demo/openai-plugin.mp4');
  expect(files.poster).toBe('/recordings/demo/openai-plugin.jpg');
  const demo = recordingPaths('/recordings', 'demo');
  for (const key of ['video', 'poster', 'recording', 'partialVideo', 'partialPoster'] as const) {
    expect(files[key]).not.toBe(demo[key]);
  }
  expect(files.failure('main')).not.toBe(demo.failure('main'));
});

it.each([['missing'], ['demo', 'openai-plugin'], ['--finish'], ['openai-plugin', '--unknown']])(
  'rejects invalid selection %j instead of falling back to the account-resetting demo',
  (...args) => {
    expect(() => recordingOptions(args)).toThrow('Usage: pnpm demo:record');
  },
);
