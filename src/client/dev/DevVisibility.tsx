import type { ReactNode } from 'react';
import { ActionIcon, Portal, Tooltip } from '@mantine/core';
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

  // Portal to the body so the fixed-positioned toggle anchors to the viewport.
  // The app shell uses `backdrop-filter`, which makes it the containing block for
  // `position: fixed` descendants — without the portal the toggle pins to the
  // scrolling card instead of the viewport corner.
  return (
    <Portal>
      <Tooltip label={label} position="left" withinPortal={false}>
        <ActionIcon
          aria-label={label}
          className="dev-visibility-toggle remdo-interaction-surface"
          color={visible ? 'blue' : 'gray'}
          onClick={() => setVisible((current) => !current)}
          radius="xl"
          size="lg"
          variant="outline"
        >
          <Icon icon={visible ? IconSettingsFilled : IconSettings} />
        </ActionIcon>
      </Tooltip>
    </Portal>
  );
}
