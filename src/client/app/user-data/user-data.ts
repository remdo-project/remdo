import { createContext, use } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { UserDataNote } from '#note-sdk';
import type { UserDataRuntime } from './stored-user-data';

export { resetUserDataRuntime as resetUserData } from './stored-user-data';
export const UserDataContext = createContext<UserDataRuntime | null>(null);

export function useUserDataRuntime(): UserDataRuntime {
  const runtime = use(UserDataContext);
  if (!runtime) {
    throw new Error('User data requires an authenticated account.');
  }
  return runtime;
}

export function useUserData(): UserDataNote {
  const runtime = useUserDataRuntime();
  // The adapter reads the same cache observed by React; it carries no mirror of
  // query data or lifecycle state of its own.
  useQuery({ ...runtime.documentsQuery, notifyOnChangeProps: ['data'] });
  useQuery({ ...runtime.bootstrapQuery, notifyOnChangeProps: ['data'] });
  return runtime.userData;
}

export function useDocumentSourcesLoading(): boolean {
  const runtime = useUserDataRuntime();
  return useQuery(runtime.documentsQuery).isPending;
}

export function useUserDataStatus() {
  const runtime = useUserDataRuntime();
  const bootstrap = useQuery(runtime.bootstrapQuery);
  const documents = useQuery(runtime.documentsQuery);
  return {
    error: bootstrap.error ?? documents.error,
    retry: () => {
      void bootstrap.refetch();
      void documents.refetch();
    },
  };
}
