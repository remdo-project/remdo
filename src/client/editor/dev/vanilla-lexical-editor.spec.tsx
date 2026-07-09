import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
});

describe('vanilla Lexical editor dev visibility', () => {
  it('hides the dev route content when dev tooling is hidden', async () => {
    localStorage.setItem('remdo-dev-tooling-visible', 'false');
    vi.resetModules();
    const { default: VanillaLexicalEditor } = await import('./VanillaLexicalEditor');
    const { container } = render(<VanillaLexicalEditor />);

    expect(container.querySelector('.vanilla-lexical')).toBeNull();
  });
});
