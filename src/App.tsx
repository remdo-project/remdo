import { Container, MantineProvider, Stack, Title } from '@mantine/core';
import Editor from './editor/Editor';
import { theme } from './theme';
import '@mantine/core/styles.css';

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Container size="xl" p="xl" pb="xl">
        <Stack gap="lg" align="center">
          <Title order={1}>Lexical Editor</Title>
          <Editor />
        </Stack>
      </Container>
    </MantineProvider>
  );
}
