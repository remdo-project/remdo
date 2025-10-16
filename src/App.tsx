import { Anchor, Container, Group, MantineProvider, Title } from '@mantine/core';
import Editor from './editor/Editor';
import { RemDoIcon } from './icons/RemDoIcon';
import headerStyles from './styles/AppHeader.module.css';
import { theme } from './theme';
import '@mantine/core/styles.css';

interface HostContext {
  protocol: string;
  hostname: string;
  basePort: number;
}

function resolveHost(): HostContext | null {
  if (typeof window === 'undefined') return null;

  const { protocol, hostname, port } = window.location;
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

export default function App() {
  const host = resolveHost();
  const previewUrl = host ? buildUrl(host, 3) : '#preview';
  const vitestUrl = host ? buildUrl(host, 2, '/__vitest__/') : '#vitest';

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Container size="xl" py="xl">
        <header className="app-header">
          <Group gap="md">
            <Title order={1} className="app-heading-title">
              <a href="/" className={headerStyles.brandLink}>
                <RemDoIcon className={headerStyles.brandIcon} />
                RemDo
              </a>
            </Title>
          </Group>
          <nav>
            <Group gap="md" className="app-header-links">
              <Anchor className="app-header-link" href={previewUrl}>
                Preview
              </Anchor>
              <Anchor className="app-header-link" href={vitestUrl}>
                Vitest
              </Anchor>
            </Group>
          </nav>
        </header>

        <Editor />
      </Container>
    </MantineProvider>
  );
}
