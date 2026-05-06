export const APP_TITLE = 'RemDo';
export const NAVIGATION_LABEL_MAX_LENGTH = 48;
export const UNTITLED_LABEL = 'Untitled';

export function normalizeNavigationLabel(raw: string): string {
  return raw.trim().replaceAll(/\s+/g, ' ');
}

export function formatNavigationLabel(
  raw: string,
  maxLength = NAVIGATION_LABEL_MAX_LENGTH
): string {
  const normalized = normalizeNavigationLabel(raw);
  const label = normalized.length > 0 ? normalized : UNTITLED_LABEL;
  if (label.length <= maxLength) {
    return label;
  }
  return `${label.slice(0, maxLength)}...`;
}
