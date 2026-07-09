import type { ReactNode } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconSettings, IconSettingsFilled } from '@tabler/icons-react';
import { Icon } from '#client/ui/Icon';
import './DevVisibility.css';

const STORAGE_KEY = 'remdo-dev-tooling-visible';

function useDevToolingVisible() {
  return useLocalStorage({
    key: STORAGE_KEY,
    defaultValue: true,
    getInitialValueInEffect: false,
  });
}

export function DevVisibilityGate({ children }: { children: ReactNode }) {
  const [visible] = useDevToolingVisible();
  return visible ? <>{children}</> : null;
}

export function DevVisibilityControl() {
  const [visible, setVisible] = useDevToolingVisible();
  const label = visible ? 'Hide dev tools' : 'Show dev tools';

  return (
    <Tooltip label={label} position="left" withinPortal={false}>
      <ActionIcon
        aria-label={label}
        className="dev-visibility-toggle remdo-interaction-surface"
        color={visible ? 'blue' : 'gray'}
        onClick={() => setVisible((current) => !current)}
        radius="xl"
        size="lg"
        variant={visible ? 'filled' : 'light'}
      >
        <Icon icon={visible ? IconSettingsFilled : IconSettings} />
      </ActionIcon>
    </Tooltip>
  );
}
