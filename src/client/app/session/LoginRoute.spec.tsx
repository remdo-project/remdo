import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { CONFIRMED_SIGN_OUT_KEY, PENDING_SIGN_OUT_STORAGE_KEY } from './client';
import LoginRoute from './LoginRoute';

afterEach(() => localStorage.clear());

it('observes logout confirmation arriving between render and subscription', async () => {
  localStorage.setItem(PENDING_SIGN_OUT_STORAGE_KEY, 'logout-generation');

  function ConfirmFromPeer() {
    useLayoutEffect(() => {
      localStorage.setItem(CONFIRMED_SIGN_OUT_KEY, 'logout-generation');
      window.dispatchEvent(new StorageEvent('storage', {
        key: CONFIRMED_SIGN_OUT_KEY,
        newValue: 'logout-generation',
      }));
    }, []);
    return null;
  }

  const router = createMemoryRouter([{
    path: '/',
    element: <><LoginRoute /><ConfirmFromPeer /></>,
  }]);
  render(<MantineProvider><RouterProvider router={router} /></MantineProvider>);

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("You're signed out"));
  expect(screen.queryByRole('button', { name: 'Finish signing out' })).toBeNull();
});
