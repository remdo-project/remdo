import { Group, Text } from '@mantine/core';
import { IconCloudCheck, IconCloudOff, IconCloudX } from '@tabler/icons-react';
import { Icon } from '@/ui/Icon';
import type { IconComponent } from '@/ui/Icon';
import { useCollaborationStatus } from './CollaborationProvider';

type StatusKey = 'local' | 'connecting' | 'syncing' | 'live';

const STATUS_CONFIG: Record<StatusKey, { icon: IconComponent; color?: string }> = {
  live: { icon: IconCloudCheck },
  syncing: { icon: IconCloudX, color: 'var(--mantine-color-yellow-6)' },
  connecting: { icon: IconCloudX, color: 'var(--mantine-color-yellow-6)' },
  local: { icon: IconCloudOff, color: 'var(--mantine-color-red-6)' },
};

export function CollaborationConnectionStatus() {
  const { enabled, hydrated, synced } = useCollaborationStatus();

  const status: StatusKey = enabled
    ? hydrated
      ? synced
        ? 'live'
        : 'syncing'
      : 'connecting'
    : 'local';
  const { icon, color } = STATUS_CONFIG[status];
  const label = `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;

  return (
    <Group gap={0} align="center" className="collab-status" style={color ? { color } : undefined} aria-label={label}>
      <Icon icon={icon} />
      <Text size="sm" className="collab-status-text">{label}</Text>
    </Group>
  );
}
