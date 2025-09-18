import "./common";
import { it } from "vitest";
import { getVisibleNotes } from "./common";
import { $getEditor } from "lexical";
import { ListItemNode, $isListNode } from "@lexical/list";
import { $getNoteID } from "@/components/Editor/plugins/remdo/utils/noteState";
import { getRemdoState } from "@/components/Editor/plugins/remdo/utils/remdoState";

it("focus", async ({ load, queries, expect, lexicalUpdate }) => {
  const { note12 } = load("tree_complex");
  let note12ID: string;
  lexicalUpdate(() => {
    note12ID = note12.id;
    note12.focus();
  });
  expect(getVisibleNotes(queries)).toEqual([
    'note12',
    'note120',
    'note1200',
    'note1201',
  ]);
  lexicalUpdate(() => {
    const focusNode = getRemdoState($getEditor())?.getFocus() as ListItemNode | undefined;
    expect(focusNode).toBeTruthy();
    expect($getNoteID(focusNode)).toEqual(note12ID);
  });
});

it("marks lists as filtered or unfiltered when focusing", async ({
  load,
  lexicalUpdate,
  editor,
  expect,
}) => {
  const { note12, note0 } = load("tree_complex");
  let childListKey: string | null = null;

  lexicalUpdate(() => {
    const listNode = note12.lexicalNode
      .getChildren()
      .find($isListNode);
    childListKey = listNode?.getKey() ?? null;
  });

  expect(childListKey).toBeTruthy();

  const getChildListElement = () =>
    childListKey ? editor.getElementByKey(childListKey) : null;

  expect(getChildListElement()?.classList.contains("filtered")).toBe(false);
  expect(getChildListElement()?.classList.contains("unfiltered")).toBe(false);

  lexicalUpdate(() => {
    note12.focus();
  });
  expect(getChildListElement()?.classList.contains("unfiltered")).toBe(true);

  lexicalUpdate(() => {
    note0.focus();
  });
  const childListElement = getChildListElement();
  expect(childListElement?.classList.contains("filtered")).toBe(true);
  expect(childListElement?.classList.contains("unfiltered")).toBe(false);
});
