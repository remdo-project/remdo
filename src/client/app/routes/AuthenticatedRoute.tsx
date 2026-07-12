import type { ReactNode } from 'react';
import AuthenticatedApp from '#client/app/AuthenticatedApp';
import OnlineGate from './OnlineGate';

export default function AuthenticatedRoute({ children }: { children?: ReactNode }) {
  return (
    <OnlineGate allowOfflineSession>
      <AuthenticatedApp>{children}</AuthenticatedApp>
    </OnlineGate>
  );
}
