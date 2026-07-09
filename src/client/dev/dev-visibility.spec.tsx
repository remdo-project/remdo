import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DevVisibilityControl,
  DevVisibilityGate,
} from './DevVisibility';

function renderVisibilityHarness() {
  return render(
    <MantineProvider>
      <DevVisibilityControl />
      <DevVisibilityGate>
        <section>Dev panel</section>
      </DevVisibilityGate>
    </MantineProvider>
  );
}

describe('dev tooling visibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows dev content by default and hides it from the floating control', async () => {
    renderVisibilityHarness();

    expect(screen.getByText('Dev panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide dev tools' }));

    await waitFor(() => expect(screen.queryByText('Dev panel')).toBeNull());
    expect(screen.getByRole('button', { name: 'Show dev tools' })).toBeInTheDocument();
    expect(localStorage.getItem('remdo-dev-tooling-visible')).toBe('false');
  });

  it('restores hidden state after a remount', async () => {
    const { unmount } = renderVisibilityHarness();
    fireEvent.click(screen.getByRole('button', { name: 'Hide dev tools' }));
    await waitFor(() => expect(screen.queryByText('Dev panel')).toBeNull());
    unmount();

    renderVisibilityHarness();

    expect(screen.queryByText('Dev panel')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show dev tools' })).toBeInTheDocument();
  });
});
