import { IconCloudCheck, IconCloudOff, IconCloudX } from '@tabler/icons-react';
import type { IconComponent } from '@/ui/Icon';
import type { StatusDescriptor } from '@/editor/StatusIndicators';
import { useCollaborationStatus } from './CollaborationProvider';

type StatusKey = 'local' | 'connecting' | 'syncing' | 'live';

const STATUS_CONFIG: Record<StatusKey, { icon: IconComponent; color?: string; label: string }> = {
  live: { icon: IconCloudCheck, label: 'Live' },
  syncing: { icon: IconCloudX, color: 'var(--mantine-color-yellow-6)', label: 'Syncing' },
  connecting: { icon: IconCloudX, color: 'var(--mantine-color-yellow-6)', label: 'Connecting' },
  local: { icon: IconCloudOff, color: 'var(--mantine-color-red-6)', label: 'Local' },
};

export function useCollaborationIndicator(): StatusDescriptor {
  const { enabled, hydrated, synced } = useCollaborationStatus();

  const status: StatusKey = enabled
    ? hydrated
      ? synced
        ? 'live'
        : 'syncing'
      : 'connecting'
    : 'local';
  const { icon, color, label } = STATUS_CONFIG[status];

  return {
    key: 'collab',
    visible: true,
    icon,
    color,
    ariaLabel: label,
    className: 'collab-status',
  };
}
