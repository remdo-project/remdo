//TODO try to use https://react-bootstrap.github.io/components/dropdowns/ or https://react-bootstrap.github.io/components/overlays/
//TODO this is a react component, not a lexical plugin
//TODO rename plugins to lexical plugins
import { useRemdoLexicalComposerContext } from "./ComposerContext";
import { getNotesFromSelection } from "./utils/api";
import {
  NOTES_OPEN_QUICK_MENU_COMMAND,
  NOTES_START_MOVING_COMMAND,
  NOTES_SEARCH_COMMAND,
  NOTES_TOGGLE_FOLD_COMMAND,
  NOTES_FOCUS_COMMAND,
  NOTES_SET_FOLD_LEVEL_COMMAND,
} from "./utils/commands";
import { getOffsetPosition } from "@/utils";
import { INSERT_ORDERED_LIST_COMMAND } from "@lexical/list";
import { mergeRegister } from "@lexical/utils";
import { BLUR_COMMAND, SELECTION_CHANGE_COMMAND } from "lexical";
import { COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_LOW } from "lexical";
import {
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  KEY_BACKSPACE_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from "lexical";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";

type Action = () => void;

class NoteMenuOption {
  key: string;
  title: JSX.Element;
  icon?: JSX.Element;
  action: Action;

  constructor(args: { title: string; icon?: JSX.Element; action?: Action }) {
    const regex = /(.+)?<b>(.)<\/b>(.+)?/;
    const [, beginning, key, end] = args.title.match(regex);
    this.key = key.toLowerCase();
    this.title = (
      <>
        {beginning}
        <b>{key}</b>
        {end}
      </>
    );
    this.icon = args.icon;
    this.action = args.action.bind(this);
  }
}

//TODO add option for checking
function MenuOptions({ closeMenu, position, noteKeys }) {
  const [editor] = useRemdoLexicalComposerContext();
  const [highlightedOptionIndex, setHighlightedOptionIndex] = useState(null);
  const options = useMemo(
    () => [
      new NoteMenuOption({
        title: "<b>F</b>old",
        icon: <i className="bi bi-arrows-collapse" />,
        action: () =>
          editor.dispatchCommand(NOTES_TOGGLE_FOLD_COMMAND, {
            noteKeys,
          }),
      }),
      new NoteMenuOption({
        title: "<b>M</b>ove to...",
        icon: <i className="bi bi-arrow-right-square" />,
        action: () =>
          editor.dispatchCommand(NOTES_START_MOVING_COMMAND, {
            keys: noteKeys,
          }),
      }),
      new NoteMenuOption({
        title: "<b>S</b>earch...",
        icon: <i className="bi bi-search" />,
        action: () => editor.dispatchCommand(NOTES_SEARCH_COMMAND, undefined),
      }),
      new NoteMenuOption({
        title: "Go <b>h</b>ome",
        icon: <i className="bi bi-house-door" />,
        action: () =>
          editor.dispatchCommand(NOTES_FOCUS_COMMAND, { key: "root" }),
      }),
      new NoteMenuOption({
        title: "<b>Z</b>oom in",
        icon: <i className="bi bi-zoom-in" />,
        action: () => editor.dispatchCommand(NOTES_SEARCH_COMMAND, undefined),
      }),
      new NoteMenuOption({
        title: "Zoom <b>o</b>ut",
        icon: <i className="bi bi-zoom-out" />,
        action: () => editor.dispatchCommand(NOTES_SEARCH_COMMAND, undefined),
      }),
      new NoteMenuOption({
        title: "Toggle <b>l</b>ist type",
        icon: <i className="bi bi-list-ol" />,
        action: () =>
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
      }),
    ],
    [editor, noteKeys]
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent) => {
          options[highlightedOptionIndex].action();
          closeMenu();
          event.preventDefault();
          event.stopImmediatePropagation();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_DOWN_COMMAND,
        (event) => {
          if (
            event.key === "ArrowDown" ||
            (event.key === "Tab" && !event.shiftKey)
          ) {
            setHighlightedOptionIndex(
              highlightedOptionIndex === null
                ? 0
                : (highlightedOptionIndex + 1) % options.length
            );
          } else if (
            event.key == "ArrowUp" ||
            (event.key === "Tab" && event.shiftKey)
          ) {
            setHighlightedOptionIndex(
              (highlightedOptionIndex - 1 + options.length) % options.length
            );
          } else if (event.key >= "0" && event.key <= "9") {
            editor.dispatchCommand(NOTES_SET_FOLD_LEVEL_COMMAND, {
              level: +event.key,
            });
            closeMenu();
          } else {
            const key = event.key.toLowerCase();
            const selected = options.find((o) => o.key === key);
            if (!selected) {
              closeMenu();
              return false;
            }
            selected.action();
            closeMenu();
          }
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ESCAPE_COMMAND,
        (event) => {
          closeMenu();
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          closeMenu();
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        closeMenu,
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(CLICK_COMMAND, closeMenu, COMMAND_PRIORITY_HIGH),
      editor.registerCommand<FocusEvent>(
        BLUR_COMMAND,
        (event) => {
          const menu = document.getElementById("quick-menu");
          if (menu && !menu.contains(event.relatedTarget as Node)) {
            //editor's focus is lost and the menu is not clicked, so we close it
            closeMenu();
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      )
    );
  });

  return (
    <ul
      className="list-group position-absolute dropdown"
      id="quick-menu"
      style={position}
    >
      <li className="list-group-item">
        <h6 className="dropdown-header">Press a key...</h6>
      </li>
      {options.map((option, index) => {
        const active = highlightedOptionIndex === index;
        return !option.title ? null : (
          <li
            key={option.key}
            tabIndex={-1}
            className={`list-group-item${active ? " active" : ""}`}
            role="option"
            aria-selected={active}
            aria-current={active}
            id={"typeahead-item-" + index}
            onMouseEnter={() => {
              setHighlightedOptionIndex(index);
            }}
            onClick={() => {
              option.action();
              closeMenu();
            }}
          >
            <button className="dropdown-item" type="button">
              {option.icon}&nbsp;
              <span className="text">{option.title}</span>
            </button>
          </li>
        );
      })}
      <li className="list-group-item">
        <h6 className="dropdown-header">Hints</h6>
      </li>
      <li className="list-group-item">
        <button className="dropdown-item" type="button">
          <i className="bi bi-file-binary" />
          &nbsp;Press <b>0</b>-<b>9</b> to set fold level
        </button>
      </li>
    </ul>
  );
}

export function QuickMenuPlugin() {
  const [editor] = useRemdoLexicalComposerContext();
  const hotKeyPressed = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number }>(null);
  const anchorElement = editor.getRootElement()?.parentElement;
  const [noteKeys, setNoteKeys] = useState([]);

  //TODO create useCommand hook to simplify that kind of code
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<KeyboardEvent>(
        KEY_DOWN_COMMAND,
        (event) => {
          if (event.key !== "Shift") {
            hotKeyPressed.current = false;
            return false;
          }
          if (!hotKeyPressed.current) {
            hotKeyPressed.current = true;
            return false;
          }
          hotKeyPressed.current = false;
          setNoteKeys(getNotesFromSelection().map((n) => n.lexicalKey));
          setPosition(
            getOffsetPosition(editor, window.getSelection().getRangeAt(0))
          );
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand<{ left: number; top: number; noteKeys: string[] }>(
        NOTES_OPEN_QUICK_MENU_COMMAND,
        ({ left, top, noteKeys }) => {
          setNoteKeys(noteKeys);
          setPosition({ left, top });
          return true;
        },
        COMMAND_PRIORITY_LOW
      )
    );
  }, [editor]);

  return (
    anchorElement &&
    ReactDOM.createPortal(
      <div>
        {position && (
          <MenuOptions
            closeMenu={() => {
              setPosition(null);
              return false;
            }}
            position={position}
            noteKeys={noteKeys}
          />
        )}
      </div>,
      anchorElement
    )
  );
}
