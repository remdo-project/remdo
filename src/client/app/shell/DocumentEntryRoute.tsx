import { useLoaderData } from 'react-router-dom';
import type { SessionGateState } from '#client/app/session/client';
import type { ParsedDocumentRef } from '#document-routes';
import LoginRoute from '#client/app/session/LoginRoute';
import DocumentRoute from '#client/app/workspace/DocumentRoute';
import AuthenticatedRoute from './AuthenticatedRoute';

export type DocumentEntryLoaderData =
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

export default function DocumentEntryRoute() {
  const data = useLoaderData<DocumentEntryLoaderData>();
  if (data.sessionState.status === 'unauthenticated') {
    return <LoginRoute />;
  }
  return (
    <AuthenticatedRoute>
      <DocumentRoute />
    </AuthenticatedRoute>
  );
}
