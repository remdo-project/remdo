import { Anchor } from '@mantine/core';
import { IconBrandVite } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { Icon } from '#client/ui/Icon';
import { DEV_LEXICAL_DEMO_ROUTE } from '#client/app/dev/dev-route-registry';

interface HostContext {
  protocol: string;
  hostname: string;
  basePort: number;
}

function resolveHost(): HostContext | null {
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

export function DevToolbarLinks() {
  const host = resolveHost();
  const vitestUrl = host ? buildUrl(host, 2, '/__vitest__/') : '#vitest';
  const playwrightUrl = host ? buildUrl({ protocol: 'http:', hostname: 'localhost', basePort: host.basePort }, 6) : '#playwright';
  const lexicalUrl = host
    ? `${host.protocol}//${host.hostname}:3000/?isCollab=true&collabEndpoint=ws://${host.hostname}:1234`
    : '#lexical';

  return (
    <>
      <Anchor className="app-header-link" href={vitestUrl}>
        <Icon icon={IconBrandVite} />
        Vitest
      </Anchor>
      <Anchor className="app-header-link" href={playwrightUrl}>
        Playwright
      </Anchor>
      <Anchor className="app-header-link" href={lexicalUrl}>
        Lexical
      </Anchor>
      <Link
        to={DEV_LEXICAL_DEMO_ROUTE.path}
        className="app-header-link"
      >
        Lexical Demo
      </Link>
    </>
  );
}
