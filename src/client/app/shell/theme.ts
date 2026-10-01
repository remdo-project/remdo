import { DEFAULT_THEME, createTheme } from '@mantine/core';
import type { MantineColorsTuple } from '@mantine/core';

// Mantine's muted grey is 4.0:1 on the raised surface; this one clears 4.5:1.
const dark = DEFAULT_THEME.colors.dark.map((shade, index) => (index === 2 ? '#8f8f8f' : shade)) as unknown as MantineColorsTuple;

export const theme = createTheme({
  colors: { dark },
  fontFamily: 'var(--remdo-font-family)',
  fontFamilyMonospace: 'var(--remdo-font-family-monospace)',
  primaryColor: 'dark',
});
