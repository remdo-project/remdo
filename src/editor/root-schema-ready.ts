import type { LexicalEditor } from 'lexical';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

const readyByEditor = new WeakMap<LexicalEditor, Deferred>();
function getDeferred(editor: LexicalEditor): Deferred {
  const existing = readyByEditor.get(editor);
  if (existing) {
    return existing;
  }

  const deferred: Deferred = {
    promise: Promise.resolve(),
    resolve: () => {},
  };

  deferred.promise = new Promise<void>((res) => {
    deferred.resolve = res;
  });

  readyByEditor.set(editor, deferred);
  return deferred;
}

export function awaitRootSchemaReady(editor: LexicalEditor): Promise<void> {
  return getDeferred(editor).promise;
}

export function markRootSchemaReady(editor: LexicalEditor): void {
  getDeferred(editor).resolve();
}
