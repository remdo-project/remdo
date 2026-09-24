import { MantineProvider } from '@mantine/core';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { config } from '#config';
import { unregisterServiceWorkers } from '#client/app/session/client';
import { theme } from './theme';
import '@mantine/core/styles.css';
import '#client/ui/styles/shared.css';
import './styles/interaction.css';

if (!config.isProd) {
  await unregisterServiceWorkers();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  // TODO: Re-enable React.StrictMode when double-render side effects are fixed.
  <MantineProvider theme={theme} defaultColorScheme="dark">
    <RouterProvider router={router} />
  </MantineProvider>
);
