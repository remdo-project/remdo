import { Button, Text } from '@mantine/core';
import { useLocation } from 'react-router-dom';
import CenteredCardPage from '#client/ui/CenteredCardPage';
import { resolveNextPathOrDefault } from './post-auth-path';

export default function OfflineRoute() {
  const location = useLocation();

  return (
    <CenteredCardPage
      description="RemDo needs a network connection before this page can open."
      title="Offline"
    >
      <Text size="sm">
        Cached document links can still open while offline after this device has loaded them.
      </Text>
      <Button
        onClick={() => {
          globalThis.location.assign(
            resolveNextPathOrDefault(location.search, globalThis.location.origin, '/home'),
          );
        }}
        type="button"
      >
        Retry
      </Button>
    </CenteredCardPage>
  );
}
