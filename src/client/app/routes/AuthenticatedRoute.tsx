import type { ReactNode } from 'react';
import { useLoaderData } from 'react-router-dom';
import AuthenticatedApp from '#client/app/AuthenticatedApp';
import type { SessionGateState } from '#client/app/auth/client';
import ConnectionUnavailable from './ConnectionUnavailable';

export default function AuthenticatedRoute({ children }: { children?: ReactNode }) {
  const data = useLoaderData<{ sessionState: SessionGateState }>();

  if (data.sessionState.status === 'offline-unavailable') {
    return <ConnectionUnavailable />;
  }

  return <AuthenticatedApp>{children}</AuthenticatedApp>;
}
