import {
  $getState,
  $setState,
  createSharedNodeState,
  createState,
  $getRoot,
} from "lexical";
import type { ValueOrUpdater } from "lexical";
import { ListItemNode, $isListItemNode, $isListNode } from "@lexical/list";

const NOTE_ID_STATE = createState("remdo:id", {
  parse: (value: unknown) => (typeof value === "string" ? value : ""),
});

const NOTE_FOLDED_STATE = createState("remdo:folded", {
  parse: (value: unknown) => value === true,
});

const NOTE_CHECKED_STATE = createState("remdo:checked", {
  parse: (value: unknown) =>
    value === true ? true : value === false ? false : undefined,
});

export function $getNoteID(node: ListItemNode): string {
  return $getState(node, NOTE_ID_STATE);
}

//TODO remove
export function $ensureNoteID(node: ListItemNode): ListItemNode {
  return $setState(node, NOTE_ID_STATE, (prev) => {
    if (prev) {
      return prev;
    }
    const generator = globalThis.remdoGenerateNoteID;
    const next = generator ? generator() : "";
    if (!next) {
      throw new Error("remdoGenerateNoteID is not defined");
    }
    return next;
  });
}

export function $isNoteFolded(node: ListItemNode): boolean {
  return $getState(node, NOTE_FOLDED_STATE);
}

export function $setNoteFolded(
  node: ListItemNode,
  valueOrUpdater: ValueOrUpdater<boolean>,
): ListItemNode {
  return $setState(node, NOTE_FOLDED_STATE, (prev) => {
    const nextValue =
      typeof valueOrUpdater === "function"
        ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
        : valueOrUpdater;
    return !!nextValue;
  });
}

export function getListItemOwnText(node: ListItemNode): string {
  return node
    .getChildren()
    .filter((child) => !$isListNode(child))
    .map((child) => child.getTextContent())
    .join("");
}

export function $getNoteChecked(
  node: ListItemNode,
): boolean | undefined {
  return $getState(node, NOTE_CHECKED_STATE);
}

export function $setNoteChecked(
  node: ListItemNode,
  valueOrUpdater: ValueOrUpdater<boolean | undefined>,
): ListItemNode {
  return $setState(node, NOTE_CHECKED_STATE, valueOrUpdater);
}

//TODO remove and just make sure that the state is correctly registered when the editor is created
export function ensureListItemSharedState(editor: { _nodes?: Map<string, any> }) {
  const listItemType = ListItemNode.getType();
  const registeredNodes = editor._nodes;
  const registeredNode = registeredNodes?.get?.(listItemType);
  if (!registeredNode) {
    return;
  }
  const sharedConfigMap: Map<string, unknown> | undefined =
    registeredNode.sharedNodeState?.sharedConfigMap;
  if (
    !sharedConfigMap ||
    !sharedConfigMap.has(NOTE_ID_STATE.key) ||
    !sharedConfigMap.has(NOTE_FOLDED_STATE.key) ||
    !sharedConfigMap.has(NOTE_CHECKED_STATE.key)
  ) {
    registeredNode.sharedNodeState = createSharedNodeState(ListItemNode);
  }
}

//TODO review
function applyStatesFromJSONNode(jsonNode: any, lexicalNode: any): void {
  if (!jsonNode || !lexicalNode) {
    return;
  }

  if ($isListItemNode(lexicalNode)) {
    const state = jsonNode.$;
    if (state && state["remdo:folded"] === true) {
      $setNoteFolded(lexicalNode, true);
    }
    if (state && state["remdo:checked"] !== undefined) {
      $setNoteChecked(lexicalNode, state["remdo:checked"] as boolean | undefined);
    }
    if (jsonNode.folded === true) {
      $setNoteFolded(lexicalNode, true);
    }
    if (jsonNode.checked !== undefined) {
      $setNoteChecked(lexicalNode, jsonNode.checked as boolean | undefined);
    }
  }

  const jsonChildren: any[] = Array.isArray(jsonNode.children)
    ? jsonNode.children
    : [];
  const lexicalChildren = typeof lexicalNode.getChildren === "function"
    ? lexicalNode.getChildren()
    : [];

  let index = 0;
  for (const child of lexicalChildren) {
    if (index >= jsonChildren.length) {
      break;
    }
    applyStatesFromJSONNode(jsonChildren[index], child);
    index += 1;
  }
}

//TODO try to remove this extra step
export function restoreRemdoStateFromJSON(
  editor: { update: (fn: () => void) => void },
  serializedRoot: unknown,
): void {
  editor.update(() => {
    applyStatesFromJSONNode(serializedRoot, $getRoot());
  });
}
