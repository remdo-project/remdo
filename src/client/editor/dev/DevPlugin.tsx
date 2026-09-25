import type { ReactElement } from 'react';
import type { OpenDocument } from '#note-sdk';

import { SchemaValidationPlugin } from './SchemaValidationPlugin';
import { TreeViewPlugin } from './TreeViewPlugin';
import { TestBridgePlugin } from './TestBridgePlugin';
import { ProhibitNestedLexicalUpdatesPlugin } from './ProhibitNestedLexicalUpdatesPlugin';

export function DevPlugin({ openDocument }: { openDocument: OpenDocument }): ReactElement {
  return (
    <>
      <ProhibitNestedLexicalUpdatesPlugin />
      <SchemaValidationPlugin />
      <TreeViewPlugin />
      <TestBridgePlugin openDocument={openDocument} />
    </>
  );
}
