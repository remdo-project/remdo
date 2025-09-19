import "./common";
import { $setSearchFilter } from "@/components/Editor/plugins/remdo/utils/utils";
import { $isListNode } from "@lexical/list";
import { $getSelection, $isRangeSelection, $isTextNode } from "lexical";
import { it } from "vitest";
import { getVisibleNotes } from "./common";

it("search", async ({ load, queries, lexicalUpdate, expect }) => {
  load("tree_complex");

  const allNotes = [
    "note0",
    "note00",
    "note000",
    "note01",
    "note1",
    "note10",
    "note11",
    "note12",
    "note120",
    "note1200",
    "note1201",
  ];
  expect(getVisibleNotes(queries)).toEqual(allNotes);

  lexicalUpdate(() => $setSearchFilter("n"));
  expect(getVisibleNotes(queries)).toEqual(allNotes);

  lexicalUpdate(() => $setSearchFilter("note0"));
  expect(getVisibleNotes(queries)).toEqual([
    "note0",
    "note00",
    "note000",
    "note01",
  ]);

  lexicalUpdate(() => $setSearchFilter("note00"));
  expect(getVisibleNotes(queries)).toEqual([
    "note00",
    "note000",
  ]);
});

it("marks nested lists when filtering", async ({
  load,
  lexicalUpdate,
  editor,
  expect,
}) => {
  const { note0 } = load("basic");
  let nestedListKey: string | null = null;

  lexicalUpdate(() => {
    const listNode = note0.lexicalNode
      .getChildren()
      .find($isListNode);
    nestedListKey = listNode?.getKey() ?? null;
  });

  expect(nestedListKey).toBeTruthy();
  const getNestedListElement = () =>
    nestedListKey ? editor.getElementByKey(nestedListKey) : null;

  expect(getNestedListElement()?.classList.contains("list-unstyled")).toBe(
    false,
  );

  lexicalUpdate(() => $setSearchFilter("note00"));
  expect(getNestedListElement()?.classList.contains("list-unstyled")).toBe(
    true,
  );

  lexicalUpdate(() => $setSearchFilter(""));
  expect(getNestedListElement()?.classList.contains("list-unstyled")).toBe(
    false,
  );
});

it("clears selection when filter applied", async ({
  load,
  lexicalUpdate,
  expect,
}) => {
  const { note0 } = load("basic");

  lexicalUpdate(() => {
    const firstChild = note0.lexicalNode.getFirstChild();
    expect(firstChild).toBeTruthy();
    if (!$isTextNode(firstChild)) {
      throw new Error("Expected first child to be a text node");
    }

    firstChild.select(0, firstChild.getTextContentSize());

    const selection = $getSelection();
    expect($isRangeSelection(selection)).toBe(true);
  });

  lexicalUpdate(() => {
    $setSearchFilter("term");
    expect($getSelection()).toBeNull();
  });
});
