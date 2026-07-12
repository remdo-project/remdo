import { Button } from '@mantine/core';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useLoaderData, useRevalidator } from 'react-router-dom';
import type { SessionGateState } from '#client/app/auth/client';
import CenteredCardPage from '#client/ui/CenteredCardPage';

export default function OnlineGate({
  allowOfflineSession = false,
  children,
}: {
  allowOfflineSession?: boolean;
  children: ReactNode;
}) {
  const { sessionState } = useLoaderData<{ sessionState: SessionGateState }>();
  const unavailable = sessionState.status === 'offline-unavailable'
    || (!allowOfflineSession && sessionState.status === 'offline-remembered');

  return unavailable ? <ConnectionUnavailable /> : children;
}

function ConnectionUnavailable() {
  const { revalidate } = useRevalidator();

  useEffect(() => {
    const revalidateOnReconnect = () => {
      void revalidate();
    };
    globalThis.addEventListener('online', revalidateOnReconnect);
    return () => globalThis.removeEventListener('online', revalidateOnReconnect);
  }, [revalidate]);

  return (
    <CenteredCardPage
      description="The RemDo app server can’t be reached right now."
      title="Connection unavailable"
    >
      <Button onClick={() => {
        void revalidate();
      }} type="button">
        Retry
      </Button>
    </CenteredCardPage>
  );
}
