import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DevToolbarLinks } from './DevToolbar';

function renderDevToolbarLinks() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <DevToolbarLinks />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe('dev toolbar visibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps the floating control available while hiding dev toolbar links', () => {
    localStorage.setItem('remdo-dev-tooling-visible', 'false');
    renderDevToolbarLinks();

    expect(screen.queryByRole('link', { name: /vitest/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /playwright/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /lexical demo/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show dev tools' })).toBeInTheDocument();
  });
});
