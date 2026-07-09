import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DevVisibilityControl,
  DevVisibilityGate,
} from './DevVisibility';
import { setDevToolingVisible } from './dev-visibility-store';

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
    setDevToolingVisible(true);
  });

  it('shows dev content by default and hides it from the floating control', () => {
    renderVisibilityHarness();

    expect(screen.getByText('Dev panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide dev tools' }));

    expect(screen.queryByText('Dev panel')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show dev tools' })).toBeInTheDocument();
    expect(localStorage.getItem('remdo-dev-tooling-visible')).toBe('hidden');
  });

  it('restores hidden state after a remount', () => {
    const { unmount } = renderVisibilityHarness();
    fireEvent.click(screen.getByRole('button', { name: 'Hide dev tools' }));
    unmount();

    renderVisibilityHarness();

    expect(screen.queryByText('Dev panel')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show dev tools' })).toBeInTheDocument();
  });
});
