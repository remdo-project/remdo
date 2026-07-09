import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { setDevToolingVisible } from '#client/dev/dev-visibility-store';
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
    setDevToolingVisible(true);
  });

  it('keeps the floating control available while hiding dev toolbar links', () => {
    renderDevToolbarLinks();

    expect(screen.getByRole('link', { name: /vitest/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /playwright/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lexical demo/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide dev tools' }));

    expect(screen.queryByRole('link', { name: /vitest/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /playwright/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /lexical demo/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show dev tools' })).toBeInTheDocument();
  });
});
