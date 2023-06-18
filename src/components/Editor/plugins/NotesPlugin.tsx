import {
  NOTES_MOVE_COMMAND,
  NOTES_SET_FOLD_LEVEL_COMMAND,
  NOTES_TOGGLE_FOLD_COMMAND,
} from "../commands";
import { useNotesLexicalComposerContext } from "../lexical/NotesComposerContext";
import { Note, NotesState } from "../lexical/api";
import { $fixRoot, $isTargetWithinDecorator } from "../lexical/utils";
import { Navigation } from "./NavigationPlugin";
import { NoteControlsPlugin } from "./NoteControlsPlugin";
import "./NotesPlugin.scss";
import { SearchPlugin } from "./SearchPlugin";
import { $createListItemNode, $isListItemNode } from "@lexical/list";
import { ListItemNode } from "@lexical/list";
import { mergeRegister } from "@lexical/utils";
import {
  DELETE_CHARACTER_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
} from "lexical";
import {
  RootNode,
  INSERT_PARAGRAPH_COMMAND,
  COMMAND_PRIORITY_HIGH,
  $isRangeSelection,
  $getSelection,
  COMMAND_PRIORITY_LOW,
  $getNodeByKey,
} from "lexical";
import { COMMAND_PRIORITY_CRITICAL } from "lexical";
import PropTypes from "prop-types";
import { useEffect, useCallback } from "react";
import React from "react";
import { createPortal } from "react-dom";

export function NotesPlugin({ anchorElement, documentID }) {
  const [editor] = useNotesLexicalComposerContext();

  const handleReorder = useCallback(
    //TODO convert that to custom commands
    //ARROW_UP and ARROW_DOWN commands can't be used here because they are not
    //triggered when meta key is pressed
    (event: KeyboardEvent) => {
      if (
        event.metaKey &&
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        !(event.altKey || event.shiftKey || event.ctrlKey)
      ) {
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();

          if (!$isRangeSelection(selection)) {
            return false;
          }

          const nodesInSelection = selection.getNodes();
          const note = Note.from(nodesInSelection[0]);
          if (event.key === "ArrowDown") {
            note.moveDown();
          } else {
            note.moveUp();
          }
        });
      }
    },
    [editor]
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerRootListener((root, prevRoot) => {
        root && root.addEventListener("keydown", handleReorder);
        prevRoot && prevRoot.removeEventListener("keydown", handleReorder);
      }),
      editor.registerCommand(
        //test case "create empty notes"
        INSERT_PARAGRAPH_COMMAND,
        () => {
          //this replaces $handleListInsertParagraph logic
          //the default implementation replaces an empty list item with a
          //paragraph effectively ending the list
          //this version just creates a new empty list item
          //
          //the code below is directly copied from the beginning of
          //$handleListInsertParagraph function from lexical's code
          const selection = $getSelection();

          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }
          // Only run this code on empty list items
          const anchor = selection.anchor.getNode();

          if (!$isListItemNode(anchor) || anchor.getTextContent() !== "") {
            return false;
          }
          //end of copied code

          const newListItemNode = $createListItemNode();
          anchor.insertAfter(newListItemNode);
          newListItemNode.select();
          return true;
        },
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(
        //TODO handled twice, here and below explain and move it to a separate file
        KEY_BACKSPACE_COMMAND,
        (event: KeyboardEvent | null) => {
          //do not allow to delete top level list item node as otherwise the document structure may be invalid
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }
          const node = $getNodeByKey(selection.anchor.key);
          if (!$isListItemNode(node)) {
            return false;
          }
          if (
            !node.getPreviousSibling() &&
            node.getParent().getParent().getKey() === "root"
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerNodeTransform(RootNode, $fixRoot),
      editor.registerCommand(
        NOTES_MOVE_COMMAND,
        ({ keys, targetKey }) => {
          const moved: ListItemNode = $getNodeByKey(keys[0]);
          const target: ListItemNode = $getNodeByKey(targetKey);
          target.insertAfter(moved);
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        NOTES_SET_FOLD_LEVEL_COMMAND,
        ({ level }) => {
          NotesState.getActive().focusNote.setFoldLevel(level);
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand<KeyboardEvent>(
        //copied from lexical/packages/lexical-rich-text/src/index.ts
        //to change the behavior when backsapce is pressed at the beginning of a
        //list item node and delete the list item instead of outdenting it
        //the only difference in the implementation is the commented out code
        //and the priority of the command
        KEY_BACKSPACE_COMMAND,
        event => {
          if ($isTargetWithinDecorator(event.target as HTMLElement)) {
            return false;
          }
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return false;
          }
          event.preventDefault();
          /*
          const { anchor } = selection;
          const anchorNode = anchor.getNode();

          if (
            selection.isCollapsed() &&
            anchor.offset === 0 &&
            !$isRootNode(anchorNode)
          ) {
            const element = $getNearestBlockElementAncestorOrThrow(anchorNode);
            if (element.getIndent() > 0) {
              return editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
            }
          }
          */
          return editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ENTER_COMMAND,
        event => {
          //toggle check
          if (!event.metaKey) {
            return false;
          }
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return false;
          }
          event.preventDefault();

          const { anchor } = selection;
          const note = Note.from(anchor.getNode());
          note.toggleChecked();
          return true;
        },
        COMMAND_PRIORITY_LOW
      )
    );
  }, [editor, handleReorder]);

  return (
    <>
      <Navigation anchorElement={anchorElement} documentID={documentID} />
      <SearchPlugin />
      {createPortal(<NoteControlsPlugin />, anchorElement)}
    </>
  );
}

NotesPlugin.propTypes = {
  anchorElement: PropTypes.object.isRequired,
};
