import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { getUserDataRuntime } from './stored-user-data';
import { UserDataContext } from './user-data';

export default function UserDataRuntimeBoundary({ children, userId }: { children: ReactNode; userId: string }) {
  const runtime = getUserDataRuntime(userId);
  return (
    <QueryClientProvider client={runtime.client}>
      <UserDataContext value={runtime}>
        {children}
      </UserDataContext>
    </QueryClientProvider>
  );
}
