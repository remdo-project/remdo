import * as RawYjs from "@lexical/yjs-raw";
import { CLEAR_HISTORY_COMMAND as LexicalClearHistoryCommand } from "lexical";
import { UndoManager as YjsUndoManager } from "yjs";

export * from "@lexical/yjs-raw";
export { YjsUndoManager as UndoManager };
export const CLEAR_HISTORY_COMMAND = LexicalClearHistoryCommand;

function patchCollabBinding(binding: RawYjs.Binding): void {
  const prototype = Object.getPrototypeOf(binding.root) as {
    _children: Array<unknown>;
    splice: (binding: RawYjs.Binding, index: number, delCount: number, collabNode?: unknown) => void;
    __remdoCollabSplicePatched?: boolean;
  } | null;

  if (!prototype || prototype.__remdoCollabSplicePatched) {
    return;
  }

  const originalSplice = prototype.splice;
  prototype.splice = function patchedSplice(
    this: typeof prototype,
    bindingArg: RawYjs.Binding,
    index: number,
    delCount: number,
    collabNode?: unknown,
  ) {
    if (this._children[index] === undefined && collabNode === undefined) {
      return;
    }
    return originalSplice.call(this, bindingArg, index, delCount, collabNode);
  };

  prototype.__remdoCollabSplicePatched = true;
}

export const createBinding: typeof RawYjs.createBinding = (
  editor,
  provider,
  id,
  doc,
  docMap,
  excludedProperties,
) => {
  const binding = RawYjs.createBinding(editor, provider, id, doc, docMap, excludedProperties);
  patchCollabBinding(binding);
  return binding;
};

export default {
  ...RawYjs,
  CLEAR_HISTORY_COMMAND,
  UndoManager: YjsUndoManager,
  createBinding,
};
