import { MantineProvider } from '@mantine/core';
import DocumentRoute from './DocumentRoute';
import { theme } from '@/theme';

export default function EditorE2ERoute() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <DocumentRoute />
    </MantineProvider>
  );
}
