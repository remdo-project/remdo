import "./common"; // imported for side effects

import { $isListNode } from "@lexical/list";
import {
  $createTextNode,
  $getRoot,
  ParagraphNode,
} from "lexical";
import { it } from "vitest";

it("wraps top-level paragraph nodes created by paste into the root list", async ({
  editor,
  lexicalUpdate,
  expect,
}) => {
  lexicalUpdate(() => {
    const root = $getRoot();

    // Simulate a DOM paste that inserts a top-level paragraph into the editor.
    const paragraph = new ParagraphNode();
    paragraph.append($createTextNode("Paragraph from paste"));

    root.clear();
    root.append(paragraph);
  });

  await expect(editor).toMatchNoteTree([{ text: "Paragraph from paste" }]);

  lexicalUpdate(() => {
    const root = $getRoot();
    expect(root.getChildren()).toHaveLength(1);
    expect($isListNode(root.getFirstChild())).toBe(true);
  });
});

it("merges stray paragraphs that end up after the root list", async ({
  load,
  editor,
  lexicalUpdate,
  expect,
}) => {
  load("basic");

  lexicalUpdate(() => {
    const root = $getRoot();
    const list = root.getFirstChild();
    const paragraph = new ParagraphNode();
    paragraph.append($createTextNode("Pasted below root"));

    // Simulate pasting multiple paragraphs where Lexical temporarily appends
    // a paragraph next to the root list node.
    list?.insertAfter(paragraph);
  });

  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "note00" }] },
    { text: "Pasted below root" },
  ]);

  lexicalUpdate(() => {
    const root = $getRoot();
    expect(root.getChildren()).toHaveLength(1);
    expect($isListNode(root.getFirstChild())).toBe(true);
  });
});
