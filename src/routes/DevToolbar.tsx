import { Anchor, Button, Group } from '@mantine/core';
import { IconBrandVite } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { config } from '#config';
import { Icon } from '@/ui/Icon';

interface HostContext {
  protocol: string;
  hostname: string;
  basePort: number;
}

interface DevToolbarProps {
  currentDocumentPath: string;
  onDevLoginError?: (error: unknown) => void;
  onDevLoginSuccess?: () => Promise<void> | void;
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

function buildSearch(params: { lexicalDemo?: boolean }): string {
  const searchParams = new URLSearchParams();
  if (params.lexicalDemo) {
    searchParams.set('lexicalDemo', 'true');
  }
  const search = searchParams.toString();
  return search ? `?${search}` : '';
}

export function DevToolbarLinks({
  currentDocumentPath,
  onDevLoginError,
  onDevLoginSuccess,
}: DevToolbarProps) {
  const [devLoginPending, setDevLoginPending] = useState(false);

  if (!config.isDev) {
    return null;
  }

  const host = resolveHost();
  const previewUrl = host ? buildUrl(host, 3) : '#preview';
  const vitestUrl = host ? buildUrl(host, 2, '/__vitest__/') : '#vitest';
  const playwrightUrl = host ? buildUrl({ protocol: 'http:', hostname: 'localhost', basePort: host.basePort }, 6) : '#playwright';
  const lexicalUrl = host
    ? `${host.protocol}//${host.hostname}:3000/?isCollab=true&collabEndpoint=ws://${host.hostname}:1234`
    : '#lexical';
  const handleDevLoginClick = async () => {
    setDevLoginPending(true);

    try {
      const response = await fetch('/api/dev/login', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(typeof body?.error === 'string' ? body.error : `Failed to use dev account: ${response.status}`);
      }
      await onDevLoginSuccess?.();
    } catch (error) {
      onDevLoginError?.(error);
    } finally {
      setDevLoginPending(false);
    }
  };

  return (
    <>
      {onDevLoginSuccess && (
        <Button
          loading={devLoginPending}
          onClick={() => {
            void handleDevLoginClick();
          }}
          size="xs"
          type="button"
          variant="light"
        >
          Use dev account
        </Button>
      )}
      <Anchor className="app-header-link" href={previewUrl}>
        Preview
      </Anchor>
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
        to={`${currentDocumentPath}${buildSearch({ lexicalDemo: true })}`}
        className="app-header-link"
      >
        Lexical Demo
      </Link>
    </>
  );
}

export function DevToolbar(props: DevToolbarProps) {
  if (!config.isDev) {
    return null;
  }

  return (
    <Group gap="md" className="app-header-links">
      <DevToolbarLinks {...props} />
    </Group>
  );
}
