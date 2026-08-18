import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeToSignOut } from './auth/logout-broadcast';
import { forgetAuthenticatedSession } from './auth/client';
import { startUserData, resetUserData } from './documents/user-data';

export default function UserDataRuntimeBoundary({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    startUserData();
  }, []);

  useEffect(() => subscribeToSignOut(() => {
    // Another tab signed out and is clearing this origin's storage. Tear the
    // runtime down before any further edit reaches a provider whose database is
    // being deleted underneath it.
    resetUserData();
    forgetAuthenticatedSession();
    void navigate('/', { replace: true });
  }), [navigate]);

  return <>{children}</>;
}
