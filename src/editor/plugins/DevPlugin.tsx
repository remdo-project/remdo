import type { ReactElement, ReactNode } from 'react';

import { config } from '#config';

import { SchemaValidationPlugin } from './SchemaValidationPlugin';
import { TreeViewPlugin } from './TreeViewPlugin';
import { TestBridgePlugin } from './TestBridgePlugin';

interface DevPluginProps {
  children?: ReactNode;
}

export function DevPlugin({ children }: DevPluginProps): ReactElement {
  return config.dev
    ? <>
      <SchemaValidationPlugin />
      <TreeViewPlugin />
      <TestBridgePlugin />
      {children}
    </>
    : <>{children}</>;
}

export default DevPlugin;
