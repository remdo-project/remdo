import { Button, Text } from '@mantine/core';
import { useLocation } from 'react-router-dom';
import CenteredCardPage from '#client/ui/CenteredCardPage';
import { resolvePostAuthPath } from './post-auth-path';

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
          const currentOrigin = globalThis.location.origin;
          const targetUrl = new URL(
            resolvePostAuthPath(location.search, currentOrigin),
            currentOrigin,
          );
          if (targetUrl.origin !== currentOrigin) {
            globalThis.location.assign('/');
            return;
          }
          globalThis.location.assign(targetUrl);
        }}
        type="button"
      >
        Retry
      </Button>
    </CenteredCardPage>
  );
}
