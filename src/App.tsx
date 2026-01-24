import { Anchor, Container, Group, MantineProvider, Title } from '@mantine/core';
import { IconBrandVite } from '@tabler/icons-react';
import Editor from './editor/Editor';
import VanillaLexicalEditor from './editor/dev/VanillaLexicalEditor';
import headerStyles from './styles/AppHeader.module.css';
import { theme } from './theme';
import { config } from '#config';
import '@mantine/core/styles.css';
import { Icon } from './ui/Icon';

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

function resolveDocId(): string {
  const doc = new URLSearchParams(globalThis.location.search).get('doc')?.trim();
  return doc || config.env.COLLAB_DOCUMENT_ID;
}

export default function App() {
  const host = resolveHost();
  const previewUrl = host ? buildUrl(host, 3) : '#preview';
  const vitestUrl = host ? buildUrl(host, 2, '/__vitest__/') : '#vitest';
  const playwrightUrl = host ? buildUrl({ protocol: 'http:', hostname: 'localhost', basePort: host.basePort }, 6, '') : '#playwright';
  const lexicalUrl = host
    ? `${host.protocol}//${host.hostname}:3000/?isCollab=true&collabEndpoint=ws://${host.hostname}:1234`
    : '#lexical';
  const showVanillaLexical = config.isDevOrTest && new URLSearchParams(globalThis.location.search).has('lexicalDemo');

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Container size="xl" py="xl">
        <header className="app-header">
          <Group gap="md">
            <Title order={1} className="app-heading-title">
              <a href="/" className={headerStyles.brandLink}>
                <span aria-hidden="true" className={headerStyles.brandIcon} />
                RemDo
              </a>
            </Title>
          </Group>
          <nav>
            <Group gap="md" className="app-header-links">
              <Anchor className="app-header-link" href="/?doc=project">
                Project
              </Anchor>
              {config.isDev && (
                <>
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
                  <Anchor className="app-header-link" href="/?lexicalDemo">
                    Lexical Demo
                  </Anchor>
                </>
              )}
            </Group>
          </nav>
        </header>

        {showVanillaLexical && <VanillaLexicalEditor />}
        <Editor docId={resolveDocId()} />
      </Container>
    </MantineProvider>
  );
}
