import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { InitialConfigType } from "@lexical/react/LexicalComposer";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

type EditorConfig = InitialConfigType & { disableWS: boolean };

export function useEditorConfig(): EditorConfig {
  const [searchParams] = useSearchParams();

  // intentionally set it on the first render, so further actions
  // like focusing on a particular node, won't impact the setting even if the
  // url changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const disableWS = useMemo(() => searchParams.get("ws") === "false", []);

  return {
    onError(error: any) {
      throw error;
    },
    namespace: "notes",
    nodes: [ListItemNode, ListNode, LinkNode, AutoLinkNode],
    theme: {
      list: {
        listitemChecked: "li-checked",
        ol: "editor-list-ol",
      },
      text: {
        bold: "font-weight-bold",
        code: "",
        italic: "font-italic",
        strikethrough: "strikethrough",
        subscript: "subscript",
        superscript: "superscript",
        underline: "underline",
        underlineStrikethrough: "underline strikethrough",
      },
    },
    editorState: null,
    disableWS: disableWS, //TODO remove or rename
  };
}

