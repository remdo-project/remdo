import { describe, expect, it } from 'vitest';
import { bodySnippet } from './body-snippet';

describe('bodySnippet', () => {
  it('returns a short body unchanged', () => {
    expect(bodySnippet('a short body', 'short')).toBe('a short body');
  });

  it('collapses hard line breaks and whitespace runs to single spaces', () => {
    expect(bodySnippet('first line\nsecond   line', '')).toBe('first line second line');
  });

  it('shows the opening of a long body when nothing matches in it', () => {
    const body = 'alpha bravo charlie delta echo foxtrot golf hotel india juliett kilo lima mike november';
    const snippet = bodySnippet(body, 'nothinghere');

    expect(snippet.startsWith('alpha bravo')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.startsWith('…')).toBe(false);
  });

  it('windows around a match deep in the body, marking both cut ends', () => {
    const body = `${'filler word '.repeat(20)}NEEDLE${' trailing word'.repeat(20)}`;
    const snippet = bodySnippet(body, 'needle');

    expect(snippet).toContain('NEEDLE');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('does not cut words in half at either end', () => {
    const body = `${'alpha bravo '.repeat(20)}NEEDLE${' charlie delta'.repeat(20)}`;
    const snippet = bodySnippet(body, 'needle');
    const inner = snippet.replaceAll('…', '');

    // Every whole word in the window survives intact.
    for (const word of inner.split(' ').filter(Boolean)) {
      expect(['alpha', 'bravo', 'charlie', 'delta', 'NEEDLE']).toContain(word);
    }
  });

  it('keeps a match near the start readable without a leading ellipsis', () => {
    const body = `NEEDLE ${'tail word '.repeat(30)}`;
    const snippet = bodySnippet(body, 'needle');

    expect(snippet.startsWith('NEEDLE')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('truncates a single over-long word rather than overrunning the budget', () => {
    const snippet = bodySnippet('x'.repeat(400), '', 80);

    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.replaceAll('…', '').length).toBe(80);
  });

  it('widens the window to keep a match longer than the budget whole', () => {
    // Overlapping occurrences merge into one long range; the budget is soft, so
    // the preview must still contain the whole match to explain the result.
    const run = 'ab'.repeat(60);
    const body = `${'filler word '.repeat(20)}${run}${' trailing word'.repeat(20)}`;
    const snippet = bodySnippet(body, 'abab');

    expect(snippet).toContain(run);
  });

  it('matches case-insensitively when choosing the window', () => {
    const body = `${'filler word '.repeat(20)}Needle${' trailing word'.repeat(20)}`;

    expect(bodySnippet(body, 'NEEDLE')).toContain('Needle');
  });
});
