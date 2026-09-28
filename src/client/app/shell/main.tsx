import { MantineProvider } from '@mantine/core';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { config } from '#config';
import { unregisterServiceWorkers } from '#client/app/session/client';
import { reportRenderError, startErrorReporting } from './error-reporting';
import { theme } from './theme';
import '@mantine/core/styles.css';
import '#client/ui/styles/shared.css';
import './styles/interaction.css';

if (!config.isProd) {
  await unregisterServiceWorkers();
}
void startErrorReporting();

ReactDOM.createRoot(document.getElementById('root')!, {
  // Uncaught errors reach the global handlers; boundaries such as the editor's
  // would otherwise keep caught ones from being reported.
  onCaughtError: (error, { componentStack }) => {
    void reportRenderError(error, componentStack);
    // React's default handler, which this replaces, logs caught errors.
    console.error(error);
  },
}).render(
  // TODO: Re-enable React.StrictMode when double-render side effects are fixed.
  <MantineProvider theme={theme} defaultColorScheme="dark">
    <RouterProvider router={router} />
  </MantineProvider>
);
