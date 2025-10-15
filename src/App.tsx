import { Container, MantineProvider, Stack, Title } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import Editor from './editor/Editor';
import { theme } from './theme';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications />
      <Container size="xl" p="xl" pb={48}>
        <Stack gap="lg" align="center">
          <Title order={1} ta="center">
            Lexical Editor
          </Title>
          <Editor />
        </Stack>
      </Container>
    </MantineProvider>
  );
}
