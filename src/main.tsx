import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';

ReactDOM.createRoot(document.getElementById('root')!).render(
  // TODO: Re-enable React.StrictMode when double-render side effects are fixed.
  <RouterProvider router={router} />
);
