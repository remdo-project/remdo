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
  it('links Playground to the stable, same-origin /playground/ URL', () => {
    renderDevToolbarLinks();

    const playground = screen.getByRole('link', { name: 'Playground' });

    // Same-origin relative path — no host/port math (the playground is served
    // by the app itself), so the URL is stable across hosts.
    expect(playground.getAttribute('href')).toBe('/playground/');
  });
});
