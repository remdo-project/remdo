import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const interactionCss = read('./interaction.css');
const editorCss = read('../../../../client/editor/shell/Editor.css');

describe('shared menu button styling', () => {
  // The More icon is a mask over background-color: an undefined fill variable
  // resolves to transparent and erases the icon on hover.
  it('defines the hover fill outside the editor container that surfaces share', () => {
    expect(interactionCss).toMatch(/:root\s*\{[^}]*--indicator-highlight-color:/);
    expect(editorCss).not.toMatch(/--indicator-highlight-color:/);
  });

  it('paints the shared menu button with an opaque resting and hover fill', () => {
    const button = /\.remdo-menu-button\s*\{([^}]*)\}/.exec(interactionCss)?.[1];
    expect(button).toMatch(/background-color:\s*var\(--mantine-color-dark-2\)/);

    const hover = /\.remdo-menu-button:hover,\s*\.remdo-menu-button:focus-visible\s*\{([^}]*)\}/
      .exec(interactionCss)?.[1];
    expect(hover).toMatch(/background-color:\s*var\(--indicator-highlight-color\)/);
  });
});
