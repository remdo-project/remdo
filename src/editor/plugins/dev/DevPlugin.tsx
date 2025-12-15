import type { ReactElement, ReactNode } from 'react';

import { config } from '#config';

import { SchemaValidationPlugin } from './SchemaValidationPlugin';
import { TreeViewPlugin } from './TreeViewPlugin';
import { TestBridgePlugin } from './TestBridgePlugin';

interface DevPluginProps {
  children?: ReactNode;
  onTestBridgeReady?: (api: unknown) => void;
  onTestBridgeDispose?: () => void;
}

export function DevPlugin({ children, onTestBridgeReady, onTestBridgeDispose }: DevPluginProps): ReactElement {
  const enableDevTools = config.dev || config.mode === 'test';

  return enableDevTools
    ? <>
      <SchemaValidationPlugin />
      <TreeViewPlugin />
      <TestBridgePlugin onTestBridgeReady={onTestBridgeReady} onTestBridgeDispose={onTestBridgeDispose} />
      {children}
    </>
    : <>{children}</>;
}

export default DevPlugin;
