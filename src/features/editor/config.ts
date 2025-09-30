import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { useRef } from "react";
import { useSearchParams } from "react-router-dom";

type EditorConfig = InitialConfigType & { collabDisabled: boolean };

export function useCollaborationDisabled(): boolean {
  const [searchParams] = useSearchParams();
  const collabDisabledRef = useRef<boolean | null>(null);

  if (collabDisabledRef.current === null) {
    const collabParam = searchParams.get("collab");
    collabDisabledRef.current = collabParam === "false";
  }

  return collabDisabledRef.current ?? false;
}

export function useEditorConfig(): EditorConfig {
  const collabDisabled = useCollaborationDisabled();

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
    collabDisabled,
  };
}
