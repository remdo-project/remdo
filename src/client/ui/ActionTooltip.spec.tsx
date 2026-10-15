import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from 'react-aria-components';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActionTooltip } from './ActionTooltip';

beforeEach(() => vi.useFakeTimers());

afterEach(async () => {
  // Close both pending hovers and open hints before draining the library's
  // shared cooldown timer, so each case begins with a fresh hover delay.
  for (const button of screen.queryAllByRole('button')) {
    fireEvent.pointerLeave(button, { pointerType: 'mouse' });
  }
  fireEvent.keyDown(document, { key: 'Escape' });
  cleanup();
  await act(() => vi.runAllTimers());
  vi.useRealTimers();
});

function examples() {
  render(<>
    <ActionTooltip label="Bold (Ctrl+B)"><Button>Bold</Button></ActionTooltip>
    <ActionTooltip label="Italic (Ctrl+I)"><Button>Italic</Button></ActionTooltip>
  </>);
}

function hover(button: HTMLElement) {
  fireEvent.pointerMove(button, { pointerType: 'mouse' });
  fireEvent.pointerEnter(button, { pointerType: 'mouse' });
}

it('waits on the first hover, switches hints immediately, and cancels a passing hover', async () => {
  examples();
  const bold = screen.getByRole('button', { name: 'Bold' });
  const italic = screen.getByRole('button', { name: 'Italic' });
  hover(bold);
  await act(() => vi.advanceTimersByTime(199));
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.pointerLeave(bold, { pointerType: 'mouse' });
  await act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  hover(bold);
  await act(() => vi.advanceTimersByTime(199));
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  await act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('tooltip')).toHaveTextContent('Bold (Ctrl+B)');
  expect(bold).toHaveAccessibleDescription('Bold (Ctrl+B)');
  fireEvent.pointerLeave(bold, { pointerType: 'mouse' });
  hover(italic);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Italic (Ctrl+I)');
  expect(screen.getAllByRole('tooltip')).toHaveLength(1);
});

it('shows keyboard hints immediately and dismisses them without moving focus', () => {
  examples();
  const bold = screen.getByRole('button', { name: 'Bold' });
  fireEvent.keyDown(document, { key: 'Tab' });
  act(() => bold.focus());
  expect(bold).toHaveFocus();
  expect(screen.getByRole('tooltip')).toHaveTextContent('Bold (Ctrl+B)');
  fireEvent.keyDown(bold, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(bold).toHaveFocus();
  fireEvent.keyDown(bold, { key: 'Tab' });
  const italic = screen.getByRole('button', { name: 'Italic' });
  act(() => italic.focus());
  expect(screen.getByRole('tooltip')).toHaveTextContent('Italic (Ctrl+I)');
  fireEvent.keyDown(italic, { key: ' ' });
  fireEvent.keyUp(italic, { key: ' ' });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Italic' })).toHaveFocus();
});
