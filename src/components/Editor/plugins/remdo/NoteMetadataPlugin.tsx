//TODO review
import { useEffect } from "react";
import { mergeRegister } from "@lexical/utils";
import { useRemdoLexicalComposerContext } from "./ComposerContext";
import {
  ListItemNode,
  $isListItemNode,
  $isListNode,
} from "@lexical/list";
import {
  $ensureNoteID,
  $getNoteID,
  $isNoteFolded,
  $getNoteChecked,
  getListItemOwnText,
} from "./utils/noteState";
import { $getNodeByKey, LexicalEditor, LexicalNode } from "lexical";

const FILTER_TAG = "remdo:filter";
const FOCUS_TAG = "remdo:focus";

function hasNestedList(node: ListItemNode): boolean {
  return node.getChildren().some((child) => $isListNode(child));
}

function syncListItemElement(editor: LexicalEditor, node: ListItemNode) {
  const element = editor.getElementByKey(node.getKey());
  if (!element) {
    return;
  }

  const id = $getNoteID(node);
  if (id) {
    element.dataset.noteId = id;
  }

  const folded = $isNoteFolded(node) && hasNestedList(node);
  element.classList.toggle("note-folded", folded);

  const checked = $getNoteChecked(node);
  element.classList.toggle("li-checked", !!checked);

  const filter = editor._remdoState?.getFilter?.();
  const focusNode = editor._remdoState?.getFocus?.();
  element.classList.remove("filtered", "unfiltered");

  if (filter) {
    const ownText = getListItemOwnText(node);
    const matches = ownText.includes(filter);
    element.classList.add(matches ? "unfiltered" : "filtered");
  } else if (focusNode) {
    const focusMatches =
      focusNode.getKey() === node.getKey() ||
      focusNode.getParent()?.getKey() === node.getKey() ||
      focusNode.isParentOf(node);
    element.classList.add(focusMatches ? "unfiltered" : "filtered");
  }
}

function syncAllListItems(editor: LexicalEditor) {
  const editorState = editor.getEditorState();
  editorState.read(() => {
    const nodeMap = (editorState as unknown as {
      _nodeMap: Map<string, LexicalNode>;
    })._nodeMap;
    nodeMap.forEach((node) => {
      if ($isListItemNode(node)) {
        syncListItemElement(editor, node);
      }
    });
  });
}

export function NoteMetadataPlugin(): null {
  const [editor] = useRemdoLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerMutationListener(
        ListItemNode,
        (mutations) => {
          const needsInitialization: string[] = [];
          editor.getEditorState().read(() => {
            for (const [key, mutation] of mutations) {
              if (mutation === "destroyed") {
                continue;
              }
              const node = $getNodeByKey<ListItemNode>(key);
              if ($isListItemNode(node)) {
                if (mutation === "created" && !$getNoteID(node)) {
                  needsInitialization.push(key);
                }
                syncListItemElement(editor, node);
              }
            }
          });
          if (needsInitialization.length > 0) {
            editor.update(() => {
              needsInitialization.forEach((nodeKey) => {
                const node = $getNodeByKey<ListItemNode>(nodeKey);
                if ($isListItemNode(node)) {
                  $ensureNoteID(node);
                  syncListItemElement(editor, node);
                }
              });
            }, {tag: "remdo:metadata"});
          }
        },
        {skipInitialization: false},
      ),
      editor.registerUpdateListener(({tags}) => {
        if (tags.has(FILTER_TAG) || tags.has(FOCUS_TAG)) {
          syncAllListItems(editor);
        }
      }),
    );
  }, [editor]);

  return null;
}
