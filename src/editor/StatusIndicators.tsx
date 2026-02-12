import { Group, Text } from '@mantine/core';
import { createPortal } from 'react-dom';
import { Icon } from '@/ui/Icon';
import type { IconComponent } from '@/ui/Icon';
import { useInvariantIndicator } from './invariant';
import { useCollaborationIndicator } from './plugins/collaboration';

export interface StatusDescriptor {
  key: string;
  visible: boolean;
  icon: IconComponent;
  color?: string;
  ariaLabel: string;
  text?: string;
  className?: string;
}

function renderIndicator(descriptor: StatusDescriptor) {
  if (!descriptor.visible) return null;

  const wrapperClassName = ['status-icon', descriptor.className].filter(Boolean).join(' ');

  return (
    <Group
      key={descriptor.key}
      gap={0}
      align="center"
      className={wrapperClassName}
      style={descriptor.color ? { color: descriptor.color } : undefined}
      aria-label={descriptor.ariaLabel}
    >
      <Icon icon={descriptor.icon} />
      {descriptor.text ? <Text size="sm" className="status-icon-text">{descriptor.text}</Text> : null}
    </Group>
  );
}

interface StatusIndicatorsProps {
  portalRoot: HTMLElement | null;
}

export function StatusIndicators({ portalRoot }: StatusIndicatorsProps) {
  const indicators = [useInvariantIndicator(), useCollaborationIndicator()];
  const content = (
    <Group justify="flex-end" className="editor-header" gap="xs">
      {indicators.map(renderIndicator)}
    </Group>
  );

  if (!portalRoot) {
    return null;
  }

  return createPortal(content, portalRoot);
}
