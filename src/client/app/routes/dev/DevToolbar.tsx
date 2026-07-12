import { Anchor } from '@mantine/core';
import { IconBrandVite } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { Icon } from '#client/ui/Icon';
import { DevVisibilityControl, DevVisibilityGate } from '#client/dev/DevVisibility';
import { DEV_LEXICAL_DEMO_ROUTE } from '#client/app/dev-route';

interface HostContext {
  protocol: string;
  hostname: string;
  basePort: number;
}

function resolveHost(): HostContext {
  const { protocol, hostname, port } = globalThis.location;
  const basePort =
    port && Number(port) > 0
      ? Number(port)
      : protocol === 'https:'
        ? 443
        : 80;

  return { protocol, hostname, basePort };
}

function buildUrl(host: HostContext, portOffset: number, path = ''): string {
  return `${host.protocol}//${host.hostname}:${host.basePort + portOffset}${path}`;
}

export function DevToolbarLinks({ linkClassName }: { linkClassName?: string }) {
  const host = resolveHost();
  const localhost = { protocol: 'http:', hostname: 'localhost', basePort: host.basePort };
  const pwaUrl = buildUrl(localhost, 20);
  const vitestUrl = buildUrl(host, 2, '/__vitest__/');
  const playwrightUrl = buildUrl(localhost, 6);
  const lexicalUrl = `${host.protocol}//${host.hostname}:3000/?isCollab=true&collabEndpoint=ws://${host.hostname}:1234`;

  return (
    <>
      <DevVisibilityControl />
      <DevVisibilityGate>
        <Anchor className={linkClassName} href={pwaUrl}>
          PWA
        </Anchor>
        <Anchor className={linkClassName} href={vitestUrl}>
          <Icon icon={IconBrandVite} />
          Vitest
        </Anchor>
        <Anchor className={linkClassName} href={playwrightUrl}>
          Playwright
        </Anchor>
        <Anchor className={linkClassName} href={lexicalUrl}>
          Lexical
        </Anchor>
        <Link
          to={DEV_LEXICAL_DEMO_ROUTE}
          className={linkClassName}
        >
          Lexical Demo
        </Link>
        {/* Stable, same-origin URL of the most recently generated playground (the
            `playground` skill overwrites public/playground/index.html). The exact
            file path is required: Vite dev serves public/ files by exact path and
            would fall the bare /playground/ through to the SPA. See
            docs/dev/dev-tooling.md. */}
        <Anchor className={linkClassName} href="/playground/index.html">
          Playground
        </Anchor>
      </DevVisibilityGate>
    </>
  );
}
