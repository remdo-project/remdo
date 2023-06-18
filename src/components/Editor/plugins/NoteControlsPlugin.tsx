import {
  NOTES_OPEN_QUICK_MENU_COMMAND,
  NOTES_TOGGLE_FOLD_COMMAND,
} from "../commands";
import { useNotesLexicalComposerContext } from "../lexical/NotesComposerContext";
import { Note } from "../lexical/api";
import { getOffsetPosition, isBeforeEvent } from "@/utils";
import { NodeEventPlugin } from "@lexical/react/LexicalNodeEventPlugin";
import { mergeRegister } from "@lexical/utils";
import {
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  RootNode,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import React, { useCallback, useEffect, useState } from "react";

export function NoteControlsPlugin() {
  const [editor] = useNotesLexicalComposerContext();
  const [noteFolded, setNoteFolded] = useState(false);
  const [noteHasChildren, setNoteHasChildren] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [noteElement, setNoteElement] = useState(null);

  const menuClick = e => {
    e.preventDefault();
    const { left, top, height } = getOffsetPosition(editor, e.target);
    editor.update(() => {
      editor.dispatchCommand(NOTES_OPEN_QUICK_MENU_COMMAND, {
        left,
        top: top + height,
        noteKeys: [$getNearestNodeFromDOMNode(noteElement).getKey()],
      });
    });
  };

  const updateNoteState = useCallback(
    (targetElement: HTMLElement, { folded = null } = {}) => {
      setNoteFolded(
        folded !== null
          ? folded
          : targetElement.classList.contains("note-folded")
      );
      setNoteHasChildren(
        targetElement?.nextElementSibling?.classList.contains("li-nested")
      );
      setNoteElement(targetElement);
    },
    []
  );

  const setMenuPosition = useCallback(
    (targetElement: HTMLElement) => {
      if (!targetElement) {
        return;
      }
      updateNoteState(targetElement);
      setMenuStyle({
        ...getOffsetPosition(editor, targetElement),
        transform: `translate(-100%, 0)`,
      });
    },
    [editor, updateNoteState]
  );

  const toggleFold = event => {
    event.preventDefault();
    editor.update(
      () => {
        const key = $getNearestNodeFromDOMNode(noteElement).getKey();
        editor.dispatchCommand(NOTES_TOGGLE_FOLD_COMMAND, { noteKeys: [key] });
      }
    );
  };

  const rootMouseMove = (event: MouseEvent) => {
    //move controls to the hovered note (li)
    //additionally highligh note dot (li::before) if it's hovered
    //it would be easier to assign this listener to ListItemNode instead of RootNode
    //the problem is that indented ListItem element don't extend to the left side of the RootNode element
    //this is also why, it's better to find list items on the very right side of the RootNode element
    const editorRect = editor.getRootElement().getBoundingClientRect();
    const editorComputedStyle = getComputedStyle(editor.getRootElement());
    const li = document.elementFromPoint(
      editorRect.left +
        parseFloat(editorComputedStyle.width) -
        parseFloat(editorComputedStyle.paddingRight) -
        parseFloat(editorComputedStyle.borderRightWidth) -
        1,
      event.y
    ) as HTMLElement;
    if (li && li.tagName.toLowerCase() === "li") {
      setMenuPosition(li);

      const beforeContent = isBeforeEvent(li, event)
        ? '"\uF519"' //bi-record-fill icon
        : null;
      editor
        .getRootElement()
        .style.setProperty("--hovered-note-before-content", beforeContent);
    }
  };

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        NOTES_TOGGLE_FOLD_COMMAND,
        ({ noteKeys }) => {
          if (!noteKeys.length) {
            return false;
          }
          const folded = !Note.from(noteKeys[0]).folded;
          noteKeys.forEach(key => {
            Note.from(key).folded = folded;
            updateNoteState(noteElement, { folded });
          });
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return false;
          }
          const focusLIElement = editor
            .getElementByKey(selection.focus.key)
            .closest("li");
          setMenuPosition(focusLIElement);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      )
    );
  }, [editor, noteElement, setMenuPosition, updateNoteState]);

  return (
    <>
      <NodeEventPlugin
        nodeType={RootNode}
        eventType={"mousemove"}
        eventListener={rootMouseMove}
      />
      {menuStyle && (
        <div id="hovered-note-menu" style={menuStyle}>
          {(noteHasChildren || noteFolded) && (
            <a
              href="/"
              onClick={toggleFold}
              className="text-decoration-none link-secondary"
            >
              <i className={"bi bi-" + (noteFolded ? "plus" : "dash")}></i>
            </a>
          )}
          <a
            href="/"
            onClick={menuClick}
            className="text-decoration-none link-secondary"
          >
            <i className="bi bi-list"></i>
          </a>
        </div>
      )}
    </>
  );
}
