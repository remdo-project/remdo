import { Button } from '@mantine/core';
import { useEffect } from 'react';
import { useRevalidator } from 'react-router-dom';
import CenteredCardPage from '#client/ui/CenteredCardPage';

export default function ConnectionUnavailable() {
  const revalidator = useRevalidator();

  useEffect(() => {
    const revalidate = () => {
      void revalidator.revalidate();
    };
    globalThis.addEventListener('online', revalidate);
    return () => globalThis.removeEventListener('online', revalidate);
  }, [revalidator]);

  return (
    <CenteredCardPage
      description="The RemDo app server can’t be reached right now."
      title="Connection unavailable"
    >
      <Button onClick={() => {
        void revalidator.revalidate();
      }} type="button">
        Retry
      </Button>
    </CenteredCardPage>
  );
}
