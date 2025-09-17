import "./common";
import { it } from "vitest";
import { getVisibleNotes } from "./common";
import { $getEditor } from "lexical";
import { ListItemNode } from "@lexical/list";
import { $getNoteID } from "@/components/Editor/plugins/remdo/utils/noteState";

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
    const focusNode = $getEditor()._remdoState.getFocus() as ListItemNode;
    expect($getNoteID(focusNode)).toEqual(note12ID);
  });
});
