import type { ReactElement } from 'react';
import type { DocumentSession } from '#note-sdk';

import { SchemaValidationPlugin } from './SchemaValidationPlugin';
import { TreeViewPlugin } from './TreeViewPlugin';
import { TestBridgePlugin } from './TestBridgePlugin';
import { ProhibitNestedLexicalUpdatesPlugin } from './ProhibitNestedLexicalUpdatesPlugin';

export function DevPlugin({ session }: { session: DocumentSession }): ReactElement {
  return (
    <>
      <ProhibitNestedLexicalUpdatesPlugin />
      <SchemaValidationPlugin />
      <TreeViewPlugin />
      <TestBridgePlugin session={session} />
    </>
  );
}
