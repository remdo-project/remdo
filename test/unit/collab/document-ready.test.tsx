import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { env } from '#env';
import React from 'react';
import { Routes } from '@/Routes';
import type { DocumentSession } from '@/features/editor/DocumentSelector/DocumentSessionProvider';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import WS from 'ws';

vi.mock('react-bootstrap', async () => {
  const actual = await vi.importActual<typeof import('react-bootstrap')>('react-bootstrap');
  const DropdownComponent: any = ({ children, ...rest }: any) => <div {...rest}>{children}</div>;
  DropdownComponent.Item = ({ children, ...rest }: any) => <button type="button" {...rest}>{children}</button>;
  const NavDropdownComponent = ({ children, ...rest }: any) => <div {...rest}>{children}</div>;
  return {
    ...actual,
    Dropdown: DropdownComponent,
    NavDropdown: NavDropdownComponent,
  };
});

const shouldRun = env.FORCE_WEBSOCKET;

beforeAll(() => {
  if (typeof WebSocket === 'undefined') {
    globalThis.WebSocket = WS as unknown as typeof WebSocket;
  }
  globalThis.REMDO_TEST = true;
});

afterEach(() => {
  delete window.__remdoDocumentSession;
});

function getSession(): DocumentSession {
  const session = window.__remdoDocumentSession;
  if (!session) {
    throw new Error('Session not available');
  }
  return session;
}

it.runIf(shouldRun)(
  'switching documents resolves whenReady after Yjs sync and Lexical apply (real collab)',
  async () => {
    render(
      <MemoryRouter initialEntries={['/?documentID=primary']}>
        <Routes />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(window.__remdoDocumentSession).toBeDefined();
    });

    if (getSession().collabDisabled) {
      throw new Error('Collaboration is disabled; run this test in collab-enabled environment');
    }

    const since = getSession().switchEpoch;

    await act(async () => {
      getSession().setId('secondary');
    });

    await act(async () => {
      await getSession().whenReady({ since, timeout: 10000 });
    });

    expect(getSession().id).toBe('secondary');
    expect(getSession().ready).toBe(true);
    expect(getSession().yjsProvider?.synced).toBe(true);

    const since2 = getSession().switchEpoch;

    await act(async () => {
      getSession().setId('primary');
    });

    await act(async () => {
      await getSession().whenReady({ since: since2, timeout: 10000 });
    });

    expect(getSession().id).toBe('primary');
    expect(getSession().ready).toBe(true);
    expect(getSession().yjsProvider?.synced).toBe(true);
  },
  20000,
);
