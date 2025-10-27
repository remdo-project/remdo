import type { ListNode } from '@lexical/list';
import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from '@lexical/list';
import { RootNode, $createParagraphNode, $getRoot } from 'lexical';
import { defineComponent, watchEffect } from 'vue';
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';
import { useCollaborationStatus } from './collaboration';

function $ensureSingleListRoot(root: RootNode) {
  if (!$needsListNormalization(root)) {
    return;
  }

  const rootChildren = root.getChildren();
  const firstChild = rootChildren[0];
  const existingList = rootChildren.find($isListNode);
  const canonicalListType = existingList?.getListType() ?? 'bullet';

  let canonicalList: ListNode;
  if ($isListNode(firstChild)) {
    canonicalList = firstChild;
  } else {
    canonicalList = $createListNode(canonicalListType);
    if (firstChild) {
      firstChild.insertBefore(canonicalList);
    } else {
      root.append(canonicalList);
    }
  }

  const mergeType = canonicalList.getListType();
  for (const child of rootChildren) {
    if (child === canonicalList) continue;

    if ($isListNode(child) && child.getListType() === mergeType) {
      canonicalList.append(...child.getChildren());
      child.remove();
      continue;
    }

    const li = $createListItemNode();
    child.remove();
    li.append(child);
    canonicalList.append(li);
  }

  if (canonicalList.getChildrenSize() === 0) {
    const li = $createListItemNode();
    li.append($createParagraphNode());
    canonicalList.append(li);
  }
}

function normalizeRootOnce(editor: ReturnType<typeof useLexicalComposer>) {
  const needsNormalization = editor.getEditorState().read(() =>
    $needsListNormalization($getRoot())
  );

  if (needsNormalization) {
    editor.update(() => {
      $ensureSingleListRoot($getRoot());
    });
  }
}

function $needsListNormalization(root: RootNode): boolean {
  const first = root.getFirstChild();
  if (!$isListNode(first)) {
    return true;
  }

  if (first.getNextSibling() !== null) {
    return true;
  }

  const ul = first as ListNode;
  if (ul.getChildrenSize() === 0) {
    return true;
  }

  for (const child of ul.getChildren()) {
    if (!$isListItemNode(child)) {
      return true;
    }
  }

  return false;
}

export const RootSchemaPlugin = defineComponent({
  name: 'RootSchemaPlugin',
  setup() {
    const editor = useLexicalComposer();
    const collab = useCollaborationStatus();

    watchEffect((onInvalidate) => {
      if (!collab.ready.value) {
        return;
      }

      const unregister = editor.registerNodeTransform(RootNode, $ensureSingleListRoot);
      normalizeRootOnce(editor);

      onInvalidate(unregister);
    });

    return () => null;
  },
});
