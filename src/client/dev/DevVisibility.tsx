import type { ReactNode } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { Icon } from '#client/ui/Icon';
import { setDevToolingVisible, useDevToolingVisible } from './dev-visibility-store';
import './DevVisibility.css';

export function DevVisibilityGate({ children }: { children: ReactNode }) {
  return useDevToolingVisible() ? <>{children}</> : null;
}

export function DevVisibilityControl() {
  const visible = useDevToolingVisible();
  const label = visible ? 'Hide dev tools' : 'Show dev tools';

  return (
    <Tooltip label={label} position="left" withinPortal={false}>
      <ActionIcon
        aria-label={label}
        className="dev-visibility-toggle remdo-interaction-surface"
        color={visible ? 'blue' : 'gray'}
        onClick={() => setDevToolingVisible(!visible)}
        radius="xl"
        size="lg"
        variant={visible ? 'filled' : 'light'}
      >
        <Icon icon={visible ? IconEye : IconEyeOff} />
      </ActionIcon>
    </Tooltip>
  );
}
