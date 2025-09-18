import "./common"; //imported for side effects
import { $setSearchFilter } from "@/components/Editor/plugins/remdo/utils/utils";
import { $isListNode } from "@lexical/list";
import { it } from "vitest";
import { getVisibleNotes } from "./common";

it("search", async ({ load, queries, lexicalUpdate, expect }) => {
  load("tree_complex");

  const allNotes = [
    'note0',
    'note00',
    'note000',
    'note01',
    'note1',
    'note10',
    'note11',
    'note12',
    'note120',
    'note1200',
    'note1201'
  ];
  expect(getVisibleNotes(queries)).toEqual(allNotes);

  lexicalUpdate(() => $setSearchFilter("n"));
  expect(getVisibleNotes(queries)).toEqual(allNotes);

  lexicalUpdate(() => $setSearchFilter("note0"));
  expect(getVisibleNotes(queries)).toEqual([
    'note0',
    'note00',
    'note000',
    'note01',
  ]);

  lexicalUpdate(() => $setSearchFilter("note00"));
  expect(getVisibleNotes(queries)).toEqual([
    'note00',
    'note000',
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
