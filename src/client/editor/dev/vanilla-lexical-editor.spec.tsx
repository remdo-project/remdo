import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import VanillaLexicalEditor from './VanillaLexicalEditor';

describe('vanilla Lexical editor dev visibility', () => {
  it('hides the dev route content when dev tooling is hidden', async () => {
    localStorage.setItem('remdo-dev-tooling-visible', 'false');
    const { container } = render(<VanillaLexicalEditor />);

    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelector('.vanilla-lexical')).toBeNull();
  });
});
