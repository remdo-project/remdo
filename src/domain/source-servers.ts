const SOURCE_SERVER_ID_PATTERN = /^[\w-]+$/u;
const RESERVED_SOURCE_SERVER_IDS = new Set(['local']);

export interface SourceServer {
  id: string;
  label: string;
  baseUrl: string;
  linked: boolean;
}

export function normalizeSourceServerId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!SOURCE_SERVER_ID_PATTERN.test(trimmed)) {
    return null;
  }
  if (RESERVED_SOURCE_SERVER_IDS.has(trimmed)) {
    return null;
  }
  return trimmed;
}
