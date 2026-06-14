import { Button, Container, Paper, Stack, Text, Title } from '@mantine/core';
import { useLocation } from 'react-router-dom';
import { resolveNextPathOrDefault } from './post-auth-path';

export default function OfflineRoute() {
  const location = useLocation();

  return (
    <Container size="xs" py="xl">
      <Paper withBorder p="xl" radius="md">
        <Stack gap="md">
          <div>
            <Title order={1}>Offline</Title>
            <Text c="dimmed" size="sm">
              RemDo needs a network connection before this page can open.
            </Text>
          </div>
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
        </Stack>
      </Paper>
    </Container>
  );
}
