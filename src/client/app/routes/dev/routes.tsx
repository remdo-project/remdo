import { config } from '#config';
import DevLexicalDemoRoute from './DevLexicalDemoRoute';

export const devRoutes = config.isDevOrTest
  ? [{
    path: 'dev/lexical-demo',
    element: <DevLexicalDemoRoute />,
  }]
  : [];
