import { useLoaderData } from 'react-router-dom';
import AuthenticatedApp from '#client/app/AuthenticatedApp';
import type { SessionGateState } from '#client/app/auth/client';
import type { ParsedDocumentRef } from '#document-routes';
import DocumentRoute from './DocumentRoute';
import LoginRoute from './LoginRoute';
import ConnectionUnavailable from './ConnectionUnavailable';

export type RootRouteLoaderData =
  | {
    publicServer: boolean;
    sessionState: Extract<SessionGateState, { status: 'unauthenticated' }>;
  }
  | {
    sessionState: Extract<SessionGateState, { status: 'offline-unavailable' }>;
  }
  | ParsedDocumentRef & {
    homeDocumentId: string;
    sessionState: Exclude<SessionGateState, { status: 'offline-unavailable' | 'unauthenticated' }>;
  };

export default function RootRoute() {
  const data = useLoaderData<RootRouteLoaderData>();
  if (data.sessionState.status === 'unauthenticated') {
    return <LoginRoute />;
  }
  if (data.sessionState.status === 'offline-unavailable') {
    return <ConnectionUnavailable />;
  }
  return (
    <AuthenticatedApp>
      <DocumentRoute />
    </AuthenticatedApp>
  );
}
