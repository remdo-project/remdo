import { Anchor, Container, Group, MantineProvider, Title } from '@mantine/core';
import Editor from './editor/Editor';
import { RemDoIcon } from './icons/RemDoIcon';
import { theme } from './theme';
import '@mantine/core/styles.css';

export default function App() {
  const previewUrl =
    typeof window !== 'undefined'
      ? (() => {
          const { protocol, hostname, port } = window.location;
          const basePort =
            port && Number(port) > 0
              ? Number(port)
              : protocol === 'https:'
                ? 443
                : 80;
          return `${protocol}//${hostname}:${basePort + 3}`;
        })()
      : '#preview';

  const vitestUrl =
    typeof window !== 'undefined'
      ? (() => {
          const { protocol, hostname, port } = window.location;
          const basePort =
            port && Number(port) > 0
              ? Number(port)
              : protocol === 'https:'
                ? 443
                : 80;
          return `${protocol}//${hostname}:${basePort + 2}/__vitest__/`;
        })()
      : '#vitest';

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Container size="xl" py="xl">
        <header className="app-header">
          <Group gap="md">
            <Title order={1} className="app-heading-title">
              <a href="/" className="app-heading">
                <RemDoIcon className="app-heading__icon" />
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
