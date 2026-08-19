import { Group, Text } from '@mantine/core';
import { createPortal } from 'react-dom';
import { Icon } from '#client/ui/Icon';
import type { StatusDescriptor } from '#client/editor/foundation/status-descriptor';
import { useInvariantIndicator } from '#client/editor/foundation/invariant';
import { useCollaborationIndicator } from '#client/editor/runtime/collaboration';

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
      title={descriptor.title}
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
