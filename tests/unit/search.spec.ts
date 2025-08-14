import "./common"; //imported for side effects
import { $setSearchFilter } from "@/components/Editor/plugins/remdo/utils/utils";
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
