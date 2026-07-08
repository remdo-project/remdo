import type { ReactElement } from 'react';

import { SchemaValidationPlugin } from './SchemaValidationPlugin';
import { TreeViewPlugin } from './TreeViewPlugin';
import { TestBridgePlugin } from './TestBridgePlugin';
import { ProhibitNestedLexicalUpdatesPlugin } from './ProhibitNestedLexicalUpdatesPlugin';

export function DevPlugin(): ReactElement {
  return (
    <>
      <ProhibitNestedLexicalUpdatesPlugin />
      <SchemaValidationPlugin />
      <TreeViewPlugin />
      <TestBridgePlugin />
    </>
  );
}
