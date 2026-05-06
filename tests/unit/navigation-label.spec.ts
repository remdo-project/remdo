import { describe, expect, it } from 'vitest';
import {
  formatNavigationLabel,
  NAVIGATION_LABEL_MAX_LENGTH,
  normalizeNavigationLabel,
} from '@/ui/navigation-label';

describe('navigation labels', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeNavigationLabel('  Project\n\tNotes   Today  ')).toBe('Project Notes Today');
  });

  it('uses the fallback for empty labels', () => {
    expect(formatNavigationLabel('  \n ')).toBe('Untitled');
  });

  it('truncates labels at the shared navigation length', () => {
    const label = 'x'.repeat(NAVIGATION_LABEL_MAX_LENGTH + 1);
    expect(formatNavigationLabel(label)).toBe(`${'x'.repeat(NAVIGATION_LABEL_MAX_LENGTH)}...`);
  });
});
