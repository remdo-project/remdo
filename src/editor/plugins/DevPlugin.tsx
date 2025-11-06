import type { ReactElement, ReactNode } from 'react';

import { config } from '#config';

import { SchemaValidationPlugin } from './SchemaValidationPlugin';
import { TreeViewPlugin } from './TreeViewPlugin';

interface DevPluginProps {
  children?: ReactNode;
}

export function DevPlugin({ children }: DevPluginProps): ReactElement {
  return !config.isDev
    ? <>{children}</>
    : <>
      <SchemaValidationPlugin />
      <TreeViewPlugin />
      {children}
    </>;
}

export default DevPlugin;
