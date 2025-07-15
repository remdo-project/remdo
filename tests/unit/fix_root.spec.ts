//imported for side effects
import "./common";

//intentionally use lexical API intead of Note API to test wrong editor schema
import { $createListItemNode, $createListNode } from "@lexical/list";
import { $getRoot, LexicalNode } from "lexical";
import { it } from "vitest";

it("empty", async ({ editor, expect }) => {
  await expect(editor).toMatchFileSnapshot("empty.yml");
});

it("single list - correct", async ({ editor, expect, lexicalUpdate }) => {
  lexicalUpdate(() => {
    const root = $getRoot();
    //root is cleared already in beforeEach, but after that
    //node transform listener is called, so we need to clear it again
    root.clear();
    const listNode = $createListNode("bullet");
    const listItemNode = $createListItemNode();
    listNode.append(listItemNode);
    root.append(listNode);
  });
  await expect(editor).toMatchFileSnapshot("correct.yml");
});

it("multiple lists", async ({ editor, expect, lexicalUpdate }) => {
  lexicalUpdate(() => {
    const root = $getRoot();
    //in total 3 lists as one is added automatically by the tested root node
    //transform listener
    for (let i = 0; i < 2; i++) {
      const listNode = $createListNode("bullet");
      const listItemNode = $createListItemNode();
      listNode.append(listItemNode);
      root.append(listNode);
    }
    expect(
      root.getChildren().map((node: LexicalNode) => node.getType())
    ).toEqual(["list", "list", "list"]);
  });
  lexicalUpdate(() => {
    const root = $getRoot();
    expect(
      root.getChildren().map((node: LexicalNode) => node.getType())
    ).toEqual(["list"]);
    expect(
      root
        .getFirstChild()
        .getChildren()
        .map((node: LexicalNode) => node.getType())
    ).toEqual(["listitem", "listitem", "listitem"]);
  });
  await expect(editor).toMatchFileSnapshot("fixed.yml");
});
