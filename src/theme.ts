import { createTheme } from '@mantine/core';

export const theme = createTheme({
  fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyMonospace: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",

  colors: {
    dark: [
      '#f6f7f9',
      '#f4f6f8',
      '#5c697a',
      '#252c36',
      '#1f252f',
      '#161b22',
      '#101317',
      '#0d1014',
      '#0a0c0f',
      '#07080a',
    ],
  },

  primaryColor: 'dark',

  defaultRadius: 'md',

  headings: {
    fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '1.5rem' },
    },
  },

  spacing: {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },

  other: {
    appPadding: '2rem 1rem 3rem',
    editorMaxWidth: '720px',
  },
});
