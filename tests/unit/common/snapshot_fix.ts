import { NodeSnapshotEnvironment } from '@vitest/snapshot/environment';
import path from 'path';
import { expect } from 'vitest';
import { getMinimizedState, lexicalStateKeyCompare } from './utils';
import yaml from 'js-yaml';

/* 
 vitest saves file snapshots in the same folder as the test file
 this monkey patch changes the behavior to save them in a __snapshots__ folder
 which is more inline with regular snapshots, playwright file snapshots
 plus in general makes more sense
 the problem with regular vitest shapshots is that they reside in a single
 file which disables syntax highlighting and on top of that naming them is
 misleading, because two snapshots with the same name
 can have totaly different content and reside next to each other
 */
NodeSnapshotEnvironment.prototype.resolveRawPath = function (
  testPath: string,
  rawPath: string,
): Promise<string> {
  //replace all non-alphanumeric characters with a hyphen
  const testName = expect
    .getState()
    .currentTestName
    ?.replace(/[^a-zA-Z0-9]/g, '-');

  const snapshotPath = path.join(
    path.dirname(testPath),
    '__snapshots__',
    path.basename(testPath),
    `${testName}_${rawPath}`,
  );
  return Promise.resolve(snapshotPath); //noop, just to avoid type errors
};

expect.addSnapshotSerializer({
  //Custom serializer for LexicalEditor objects
  serialize(val: any): string {
    const state = getMinimizedState(val);
    return yaml.dump(state, {
      noArrayIndent: true,
      sortKeys: lexicalStateKeyCompare,
    });
  },
  test(val) {
    return val && val.getEditorState;
  },
});
