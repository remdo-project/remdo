import { $getEditor, $getRoot, $setSelection, EditorState } from "lexical";
import { nanoid } from "nanoid";
import { ListItemNode } from "@lexical/list";
import { $getNoteID } from "./noteState";
import { setRemdoFilter } from "./remdoState";
import { syncAllListMetadata } from "./metadata";

export function $setSearchFilter(filter: string) {
  const editor = $getEditor();
  setRemdoFilter(editor, filter);
  $setSelection(null);
  syncAllListMetadata(editor);
};

export function $getNodeByID(id: string, _editorState?: EditorState) {
  const editorState =
    _editorState || $getEditor().getEditorState();
  if (id === "root") {
    return $getRoot();
  }
  return Array.from(
    editorState._nodeMap.values()
  ).find((node) => {
    return (node as ListItemNode).getKey && $getNoteID(node as ListItemNode) === id;
  });
}

globalThis.remdoGenerateNoteID = () => {
  return nanoid(8);
};

//TODO limit to dev
globalThis.printStack = (message: string | undefined) => {
  let res = message ? `${message}\n` : "";
  const styles: string[] = [];
  const stack = new Error("printStack trace").stack;
  if (!stack) {
    console.warn("No stack available");
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
  console.warn(res, ...styles);
};
