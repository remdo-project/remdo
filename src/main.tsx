import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { registerSW } from 'virtual:pwa-register';
import { config } from '#config';

if ('serviceWorker' in navigator) {
  if (config.isProd) {
    registerSW({ immediate: true });
  } else {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  // TODO: Re-enable React.StrictMode when double-render side effects are fixed.
  <RouterProvider router={router} />
);
