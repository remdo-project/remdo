import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { CONFIRMED_SIGN_OUT_KEY, PENDING_SIGN_OUT_STORAGE_KEY } from './client';
import LoginRoute from './LoginRoute';

const signOutMock = vi.hoisted(() => vi.fn());
vi.mock('./session-http', () => ({ getSession: vi.fn(), signOut: signOutMock }));

afterEach(() => {
  localStorage.clear();
  signOutMock.mockReset();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

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
  // A settled sign-out offers the ordinary link to the server-rendered form.
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

function renderLoginRoute() {
  const router = createMemoryRouter([{ path: '/', element: <LoginRoute /> }]);
  render(<MantineProvider><RouterProvider router={router} /></MantineProvider>);
}

it('finishes an unsettled sign-out before handing off to the credential form', async () => {
  localStorage.setItem(PENDING_SIGN_OUT_STORAGE_KEY, 'logout-generation');
  signOutMock.mockResolvedValue(undefined);
  renderLoginRoute();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(signOutMock).toHaveBeenCalledOnce();
  // Revocation settles before the server-rendered form is requested.
  await waitFor(() => expect(localStorage.getItem(CONFIRMED_SIGN_OUT_KEY)).toBe('logout-generation'));
});

it('reports an unreachable server instead of handing off to a form that loops back', async () => {
  localStorage.setItem(PENDING_SIGN_OUT_STORAGE_KEY, 'logout-generation');
  signOutMock.mockRejectedValue(new Error('offline'));
  renderLoginRoute();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  await waitFor(() => expect(screen.getByRole('status'))
    .toHaveTextContent('The server could not be reached. Try signing in again.'));
  // The marker survives, so the session gate still refuses to resume the session.
  expect(localStorage.getItem(PENDING_SIGN_OUT_STORAGE_KEY)).toBe('logout-generation');
  expect(localStorage.getItem(CONFIRMED_SIGN_OUT_KEY)).toBeNull();
});

it('withholds sign-in while the device cannot reach the server', async () => {
  localStorage.setItem(PENDING_SIGN_OUT_STORAGE_KEY, 'logout-generation');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

  renderLoginRoute();

  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Connect to finish signing out.');

  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  window.dispatchEvent(new Event('online'));

  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
  expect(signOutMock).not.toHaveBeenCalled();
});
