import { env } from '#env';
import { applyVitestPreviewCacheEnv } from '../../../../config/vitest-preview-env';

type DebugFn = typeof import('vitest-preview')['debug'];
type PreviewFn = (...args: Parameters<DebugFn>) => ReturnType<DebugFn>;

applyVitestPreviewCacheEnv();

// eslint-disable-next-line antfu/no-top-level-await -- ensure vitest-preview reads TMP env overrides before initializing
const { debug } = await import('vitest-preview');

let hasPreviewRun = false;

const preview: PreviewFn = (...args) => {
  if (env.CI) {
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

declare global {
  // eslint-disable-next-line vars-on-top -- ambient declaration required for global helper exposure
  var preview: PreviewFn;
}

globalThis.preview = preview;

export { preview };
