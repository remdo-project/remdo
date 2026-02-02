import { config } from '#config';

export const DEFAULT_DOC_ID = (() => {
  const candidate = config.env.COLLAB_DOCUMENT_ID.trim();
  return candidate && candidate.length > 0 ? candidate : 'main';
})();
