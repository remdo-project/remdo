import { Anchor, Container, Group, MantineProvider, Title } from '@mantine/core';
import { IconBrandVite } from '@tabler/icons-react';
import { Link, Outlet, useParams, useSearchParams } from 'react-router-dom';
import headerStyles from './styles/AppHeader.module.css';
import { theme } from './theme';
import { config } from '#config';
import '@mantine/core/styles.css';
import { Icon } from './ui/Icon';
import { createDocumentPath, DEFAULT_DOC_ID, parseDocumentRef } from './routing';
import VanillaLexicalEditor from './editor/dev/VanillaLexicalEditor';

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

function buildSearch(params: { lexicalDemo?: boolean }): string {
  const searchParams = new URLSearchParams();
  if (params.lexicalDemo) {
    searchParams.set('lexicalDemo', 'true');
  }
  const search = searchParams.toString();
  return search ? `?${search}` : '';
}

export default function App() {
  const host = resolveHost();
  const previewUrl = host ? buildUrl(host, 3) : '#preview';
  const vitestUrl = host ? buildUrl(host, 2, '/__vitest__/') : '#vitest';
  const playwrightUrl = host ? buildUrl({ protocol: 'http:', hostname: 'localhost', basePort: host.basePort }, 6, '') : '#playwright';
  const lexicalUrl = host
    ? `${host.protocol}//${host.hostname}:3000/?isCollab=true&collabEndpoint=ws://${host.hostname}:1234`
    : '#lexical';
  const { docRef } = useParams<{ docRef?: string }>();
  const [searchParams] = useSearchParams();
  const showVanillaLexical = config.isDevOrTest && searchParams.has('lexicalDemo');
  const currentDocId = parseDocumentRef(docRef)?.docId ?? DEFAULT_DOC_ID;

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Container size="xl" py="xl">
        <header className="app-header">
          <Group gap="md">
            <Title order={1} className="app-heading-title">
              <Link
                to={`${createDocumentPath(currentDocId)}${buildSearch({})}`}
                className={headerStyles.brandLink}
              >
                <span aria-hidden="true" className={headerStyles.brandIcon} />
                RemDo
              </Link>
            </Title>
          </Group>
          <nav>
            <Group gap="md" className="app-header-links">
              <Link
                to={`${createDocumentPath(DEFAULT_DOC_ID)}${buildSearch({})}`}
                className="app-header-link"
              >
                Project
              </Link>
              {!config.isDevOrTest && (
                <Anchor className="app-header-link" href="/logout">
                  Logout
                </Anchor>
              )}
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
                  <Link
                    to={`${createDocumentPath(currentDocId)}${buildSearch({ lexicalDemo: true })}`}
                    className="app-header-link"
                  >
                    Lexical Demo
                  </Link>
                </>
              )}
            </Group>
          </nav>
        </header>

        {showVanillaLexical && <VanillaLexicalEditor />}
        <Outlet />
      </Container>
    </MantineProvider>
  );
}
