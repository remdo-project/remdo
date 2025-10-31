import type { ReactElement, ReactNode } from 'react';

import { env } from '#config/env.client';

import { SchemaValidationPlugin } from './SchemaValidationPlugin';
import { TreeViewPlugin } from './TreeViewPlugin';

interface DevPluginProps {
  children?: ReactNode;
}

export function DevPlugin({ children }: DevPluginProps): ReactElement {
  return !env.isDev
    ? <>{children}</>
    : <>
      <SchemaValidationPlugin />
      <TreeViewPlugin />
      {children}
    </>;
}

export default DevPlugin;
