import "../common";
import { Note } from "@/components/Editor/plugins/remdo/utils/api";
import { $isListItemNode } from "@lexical/list";
import { $getEditor, $isTextNode } from "lexical";
import { it } from "vitest";

it("broken schema", async ({ load, expect, lexicalUpdate }) => {
  load("tests/data/regression/broken_schema");
  lexicalUpdate(() => {
    const listItem = Array.from($getEditor().getEditorState()._nodeMap.values())
      .find((n) => $isTextNode(n) && n.getTextContent() === "outdent")
      .getParent();
    expect($isListItemNode(listItem)).toBeTruthy();
    expect(listItem.getIndent()).toBe(4);
    Note.from(listItem).outdent();
    expect(listItem.getIndent()).toBeLessThan(4);
  });
});
