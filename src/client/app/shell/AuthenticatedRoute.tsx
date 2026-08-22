import type { ReactNode } from 'react';
import AuthenticatedApp from './AuthenticatedApp';
import OnlineGate from '#client/app/session/OnlineGate';

export default function AuthenticatedRoute({ children }: { children?: ReactNode }) {
  return (
    <OnlineGate allowOfflineSession>
      <AuthenticatedApp>{children}</AuthenticatedApp>
    </OnlineGate>
  );
}
