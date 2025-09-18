//TODO review
import { useEffect } from "react";
import { mergeRegister } from "@lexical/utils";
import { useRemdoLexicalComposerContext } from "./ComposerContext";
import { ListItemNode, ListNode, $isListItemNode, $isListNode } from "@lexical/list";
import { $getNodeByKey } from "lexical";
import {
  syncAllListMetadata,
  syncListElement,
  syncListItemElement,
} from "./utils/metadata";
import { $ensureNoteID, $getNoteID } from "./utils/noteState";
import { REMDO_FILTER_TAG, REMDO_FOCUS_TAG } from "./utils/remdoState";

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
      editor.registerMutationListener(
        ListNode,
        (mutations) => {
          editor.getEditorState().read(() => {
            for (const [key, mutation] of mutations) {
              if (mutation === "destroyed") {
                continue;
              }
              const node = $getNodeByKey<ListNode>(key);
              if ($isListNode(node)) {
                syncListElement(editor, node);
              }
            }
          });
        },
        {skipInitialization: false},
      ),
      editor.registerUpdateListener(({tags}) => {
        if (tags.has(REMDO_FILTER_TAG) || tags.has(REMDO_FOCUS_TAG)) {
          syncAllListMetadata(editor);
        }
      }),
    );
  }, [editor]);

  return null;
}
