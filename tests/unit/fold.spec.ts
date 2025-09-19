import "./common";
import { it } from "vitest";

it("folding", async ({ load, editor, expect, lexicalUpdate, queries }) => {
  const { note0 } = load("basic");
  await expect(editor).toMatchFileSnapshot("base.yml");
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "note00" }] },
  ]);
  await expect(queries).toShowNotes(["note0", "note00"]);

  lexicalUpdate(() => (note0.folded = true));
  await expect(editor).toMatchNoteTree([
    { text: "note0", folded: true, children: [{ text: "note00" }] },
  ]);
  const foldedElement = queries.getByText("note0").closest("li");
  expect(foldedElement).toBeTruthy();
  await expect(foldedElement!).toHaveClasses(["note-folded"]);
  await expect(queries).toShowNotes(["note0"]);

  lexicalUpdate(() => (note0.folded = true));
  await expect(editor).toMatchNoteTree([
    { text: "note0", folded: true, children: [{ text: "note00" }] },
  ]);

  lexicalUpdate(() => (note0.folded = false));
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "note00" }] },
  ]);
  const unfoldedElement = queries.getByText("note0").closest("li");
  expect(unfoldedElement).toBeTruthy();
  expect(unfoldedElement!.classList.contains("note-folded")).toBe(false);
  await expect(queries).toShowNotes(["note0", "note00"]);
});

//TODO add a check that will assure that patches won't be applied twice
it("load folded", async ({ load, expect, lexicalUpdate, editor }) => {
  const { note0 } = load("folded");
  lexicalUpdate(() => {
    expect(note0.folded).toBe(true);
  });
  await expect(editor).toMatchNoteTree([
    { text: "note0", folded: true, children: [{ text: "note1" }] },
  ]);
});

it("modify folded", async ({ load, editor, expect, lexicalUpdate, queries }) => {
  const { note0 } = load("folded");
  lexicalUpdate(() => {
    note0.lexicalNode.getFirstChild().setTextContent("note0 - modified");
  });
  lexicalUpdate(() => {
    expect(note0.folded).toBe(true);
  });
  await expect(editor).toMatchNoteTree([
    {
      text: "note0 - modified",
      folded: true,
      children: [{ text: "note1" }],
    },
  ]);
  const noteElement = queries.getByText("note0 - modified").closest("li");
  expect(noteElement).toBeTruthy();
  await expect(noteElement!).toHaveClasses(["note-folded"]);
});

it("fold to a specific level", async ({
  load,
  editor,
  expect,
  lexicalUpdate,
  queries,
}) => {
  const {
    root,
    note0,
    note00,
    note000,
    note01,
    note1,
    note10,
    note11,
    note12,
    note120,
    note1200,
    note1201,
  } = load("tree_complex");

  const allNotes = {
    note0,
    note00,
    note000,
    note01,
    note1,
    note10,
    note11,
    note12,
    note120,
    note1200,
    note1201,
  };

  const expectFolded = (names: Array<keyof typeof allNotes>) => {
    lexicalUpdate(() => {
      const folded = new Set(names);
      for (const [name, note] of Object.entries(allNotes)) {
        expect(note.folded).toBe(folded.has(name));
      }
    });
  };

  await expect(editor).toMatchFileSnapshot("base.yml");
  await expect(queries).toShowNotes([
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
  ]);

  lexicalUpdate(() => root.setFoldLevel(1));
  expectFolded(["note0", "note1"]);
  await expect(queries).toShowNotes(["note0", "note1"]);

  lexicalUpdate(() => root.setFoldLevel(2));
  expectFolded(["note00", "note12"]);
  await expect(queries).toShowNotes([
    "note0",
    "note00",
    "note01",
    "note1",
    "note10",
    "note11",
    "note12",
  ]);

  lexicalUpdate(() => root.setFoldLevel(3));
  expectFolded(["note120"]);
  await expect(queries).toShowNotes([
    "note0",
    "note00",
    "note000",
    "note01",
    "note1",
    "note10",
    "note11",
    "note12",
    "note120",
  ]);

  lexicalUpdate(() => root.setFoldLevel(4));
  expectFolded([]);
  await expect(queries).toShowNotes([
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
  ]);

  lexicalUpdate(() => root.setFoldLevel(9));
  expectFolded([]);
  await expect(queries).toShowNotes([
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
  ]);

  lexicalUpdate(() => root.setFoldLevel(0));
  expectFolded([]);
  await expect(queries).toShowNotes([
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
  ]);

  lexicalUpdate(() => root.setFoldLevel(1));
  expectFolded(["note0", "note1"]);
  await expect(queries).toShowNotes(["note0", "note1"]);

  lexicalUpdate(() => root.setFoldLevel(0));
  expectFolded([]);
  await expect(queries).toShowNotes([
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
  ]);

  await expect(editor).toMatchFileSnapshot("folded4.yml");
});
