import {
  $getEditor,
  $getRoot,
  $setSelection,
  EditorState,
} from "lexical";
import { nanoid } from "nanoid";
import { FULL_RECONCILE } from "./unexported";
import { getActiveEditorState } from "@lexical/LexicalUpdates";
import { ListItemNode } from "@lexical/list";

export function $setSearchFilter(filter: string) {
  const editor = $getEditor();
  editor._dirtyType = FULL_RECONCILE;
  editor._remdoState.setFilter(filter);
  $setSelection(null);
};

export function $getNodeByID(id: string, _editorState?: EditorState)  {
  const editorState = _editorState || getActiveEditorState();
  if (id === "root") {
    return $getRoot();
  }
  return Array.from(
    editorState._nodeMap.values()
  ).find(node => (node as ListItemNode).getID?.() === id);
}

globalThis.remdoGenerateNoteID = () => {
  return nanoid(8);
};

//TODO limit to dev
globalThis.printStack = (message: string | undefined) => {
  let res = message ? message + "\n" : "";
  const styles: string[] = [];
  const stack = new Error().stack;
  if (!stack) {
    console.log("No stack available");
    return;
  }
  stack.split("\n")
    .slice(2) //skip "Error"" and this function
    .forEach((line) => {
      let functionName = "";
      let path = "";
      let row = "";
      line.split(/\s+/)
        .filter(word => word.trim() && word.trim() !== "at")
        .forEach((word) => {
          try {
            const urlString = word.slice(1, -1);
            const url = new URL(urlString);
            path = url.pathname.split(":")[0];
            if (path.startsWith("/lexical")) {
              styles.push("color:yellow");
            } else if (path.startsWith("/node_modules")) {
              styles.push("color:lightgray");
            } else {
              styles.push("color:green");
            }
            const urlStringParts = urlString.split(":");
            row = urlStringParts[urlStringParts.length - 2];
          }
          catch {
            //not an URL, so it's likely a function name
            functionName = word;
          }
        });
      //query arg "a" is added, so chrome includes row in the link
      res += `\t%c${functionName || '(anonymous)'} file://.${path}:${row}?a\n`;
    });
  console.log(res, ...styles);
};
