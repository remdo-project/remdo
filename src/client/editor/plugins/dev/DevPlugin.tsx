import type { ReactElement } from 'react';

import { DevVisibilityGate } from '#client/dev/DevVisibility';
import { SchemaValidationPlugin } from './SchemaValidationPlugin';
import { TreeViewPlugin } from './TreeViewPlugin';
import { TestBridgePlugin } from './TestBridgePlugin';
import { ProhibitNestedLexicalUpdatesPlugin } from './ProhibitNestedLexicalUpdatesPlugin';

export function DevPlugin(): ReactElement {
  return (
    <>
      <ProhibitNestedLexicalUpdatesPlugin />
      <SchemaValidationPlugin />
      <DevVisibilityGate>
        <TreeViewPlugin />
      </DevVisibilityGate>
      <TestBridgePlugin />
    </>
  );
}
