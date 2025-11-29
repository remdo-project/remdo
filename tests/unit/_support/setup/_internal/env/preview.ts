import { config } from '#config';
import { debug } from 'vitest-preview';

export type PreviewFn = typeof debug;

declare global {
  // eslint-disable-next-line vars-on-top -- ambient declaration required for global helper exposure
  var preview: PreviewFn;
}

let hasPreviewRun = false;

const preview: PreviewFn = (...args) => {
  if (config.env.CI) {
    throw new Error('preview() is disabled in CI. Remove preview() before committing.');
  }

  if (hasPreviewRun) {
    throw new Error(
      'preview() called more than once. Remove earlier preview() calls to avoid overwriting the rendered output.'
    );
  }

  hasPreviewRun = true;
  return debug(...args);
};

globalThis.preview = preview;

export const previewSetup: Promise<void> = Promise.resolve();
