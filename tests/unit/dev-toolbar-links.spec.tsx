import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DevToolbarLinks } from '#client/app/routes/dev/DevToolbar';

function renderDevToolbarLinks() {
  const router = createMemoryRouter([
    { path: '/', element: <DevToolbarLinks /> },
  ]);
  render(
    <MantineProvider>
      <RouterProvider router={router} />
    </MantineProvider>,
  );
}

describe('dev toolbar links', () => {
  it('links Playground to the stable /playground/ URL on the app host', () => {
    renderDevToolbarLinks();

    const playground = screen.getByRole('link', { name: 'Playground' });
    const href = new URL(playground.getAttribute('href')!);

    // Same host/port as the running app (PORT_BASE + 0), stable path.
    expect(href.host).toBe(globalThis.location.host);
    expect(href.pathname).toBe('/playground/');
  });
});
