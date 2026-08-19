import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { startUserData } from './documents/user-data';

export default function UserDataRuntimeBoundary({ children }: { children: ReactNode }) {
  useEffect(() => {
    startUserData();
  }, []);

  return <>{children}</>;
}
