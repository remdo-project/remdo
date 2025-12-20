import { Text } from '@mantine/core';
import { useCollaborationStatus } from './CollaborationProvider';

export function CollaborationStatusText() {
  const { enabled, hydrated, synced } = useCollaborationStatus();

  const label = enabled
    ? hydrated
      ? synced
        ? 'Live'
        : 'Syncing'
      : 'Connecting'
    : 'Local';

  return <Text size="sm">{label}</Text>;
}
