import type { ReactElement, ReactNode } from 'react';

import { config } from '#config/client';

import { SchemaValidationPlugin } from './SchemaValidationPlugin';
import { TreeViewPlugin } from './TreeViewPlugin';

interface DevPluginProps {
  children?: ReactNode;
}

export function DevPlugin({ children }: DevPluginProps): ReactElement {
  return (
    <>
      {config.isDev && <SchemaValidationPlugin />}
      {config.isDev && <TreeViewPlugin />}
      {children}
    </>
  );
}
