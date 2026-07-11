import { useLoaderData } from 'react-router-dom';
import AuthenticatedApp from '#client/app/AuthenticatedApp';
import type { SessionGateState } from '#client/app/auth/client';
import type { ParsedDocumentRef } from '#document-routes';
import DocumentRoute from './DocumentRoute';
import LoginRoute from './LoginRoute';

export type RootRouteLoaderData =
  | {
    publicServer: boolean;
    sessionState: Extract<SessionGateState, { status: 'unauthenticated' }>;
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
  return (
    <AuthenticatedApp>
      <DocumentRoute />
    </AuthenticatedApp>
  );
}
