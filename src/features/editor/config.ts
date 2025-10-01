import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { useCollabFactory } from "./collab/useCollabFactory";
import type { ProviderFactory } from "./collab/types";

type CollaborationConfig =
  | { disabled: true }
  | { disabled?: false; providerFactory: ProviderFactory };

type EditorConfig = InitialConfigType & {
  collaboration: CollaborationConfig;
};

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
  const collabFactory = useCollabFactory();
  const collaboration = collabDisabled
    ? ({ disabled: true } as const)
    : ({ providerFactory: collabFactory } satisfies CollaborationConfig);

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
    collaboration,
  };
}
