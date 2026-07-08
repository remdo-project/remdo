import { config } from '#config';
import { DEV_LEXICAL_DEMO_ROUTE } from '#client/app/dev/dev-route-registry';
import DevLexicalDemoRoute from './DevLexicalDemoRoute';

export const devRoutes = config.isDevOrTest
  ? [{
    path: DEV_LEXICAL_DEMO_ROUTE.routerPath,
    element: <DevLexicalDemoRoute />,
  }]
  : [];
