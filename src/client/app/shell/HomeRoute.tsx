import { useLoaderData } from 'react-router-dom';
import type { SessionGateState } from '#client/app/session/client';
import LoginRoute from '#client/app/session/LoginRoute';
import Home from '#client/app/workspace/Home';
import AuthenticatedRoute from './AuthenticatedRoute';

export default function HomeRoute() {
  const data = useLoaderData<{ sessionState: SessionGateState }>();
  if (data.sessionState.status === 'unauthenticated') {
    return <LoginRoute />;
  }
  return (
    <AuthenticatedRoute>
      <Home />
    </AuthenticatedRoute>
  );
}
