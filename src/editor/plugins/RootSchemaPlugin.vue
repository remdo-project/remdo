<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import type { ListNode } from '@lexical/list';
import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';
import type { LexicalEditor } from 'lexical';
import { $createParagraphNode, $getRoot, RootNode } from 'lexical';
import { useCollaborationStatus } from './collaboration';

const editor = useLexicalComposer();
const collaboration = useCollaborationStatus();

let unregister: (() => void) | undefined;
let unsubscribeReady: (() => void) | undefined;

function handleReady(isReady: boolean) {
  if (!isReady) {
    unregister?.();
    unregister = undefined;
    return;
  }

  unregister?.();
  unregister = editor.registerNodeTransform(RootNode, $ensureSingleListRoot);
  normalizeRootOnce(editor);
}

onMounted(() => {
  unsubscribeReady = collaboration.onReadyChange(handleReady);
});

onBeforeUnmount(() => {
  unsubscribeReady?.();
  unregister?.();
  unregister = undefined;
});

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

function normalizeRootOnce(editor: LexicalEditor) {
  const needsNormalization = editor.getEditorState().read(() =>
    $needsListNormalization($getRoot()),
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
</script>

<template>
  <slot />
</template>
