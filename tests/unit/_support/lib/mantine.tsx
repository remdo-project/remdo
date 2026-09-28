import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';

// Mantine transitions otherwise leave timers that can outlive a test file's
// jsdom environment and fail the run with `window is not defined`. Reduced
// motion takes Mantine's zero-duration path, which schedules none; the shared
// `matchMedia` mock reports that preference.
const theme = { respectReducedMotion: true };

export function TestMantineProvider({ children }: { children: ReactNode }) {
  return <MantineProvider theme={theme}>{children}</MantineProvider>;
}
