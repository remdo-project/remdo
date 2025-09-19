import "./common";
import { it } from "vitest";

it("reorder flat", async ({ load, editor, expect, lexicalUpdate }) => {
  const { note0 } = load("flat");
  await expect(editor).toMatchFileSnapshot("base.yml");
  await expect(editor).toMatchNoteTree([
    { text: "note0" },
    { text: "note1" },
    { text: "note2" },
  ]);

  lexicalUpdate(() => note0.moveDown());
  await expect(editor).toMatchNoteTree([
    { text: "note1" },
    { text: "note0" },
    { text: "note2" },
  ]);

  lexicalUpdate(() => note0.moveDown());
  await expect(editor).toMatchNoteTree([
    { text: "note1" },
    { text: "note2" },
    { text: "note0" },
  ]);

  lexicalUpdate(() => note0.moveDown());
  await expect(editor).toMatchNoteTree([
    { text: "note1" },
    { text: "note2" },
    { text: "note0" },
  ]);

  lexicalUpdate(() => note0.moveUp());
  await expect(editor).toMatchNoteTree([
    { text: "note1" },
    { text: "note0" },
    { text: "note2" },
  ]);

  lexicalUpdate(() => note0.moveUp());
  await expect(editor).toMatchNoteTree([
    { text: "note0" },
    { text: "note1" },
    { text: "note2" },
  ]);

  lexicalUpdate(() => note0.moveUp());
  await expect(editor).toMatchNoteTree([
    { text: "note0" },
    { text: "note1" },
    { text: "note2" },
  ]);
});

it("reorder tree", async ({ load, editor, expect, lexicalUpdate }) => {
  const { note0 } = load("tree");
  await expect(editor).toMatchFileSnapshot("base.yml");
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "sub note 0" }] },
    { text: "note1", children: [{ text: "sub note 1" }] },
  ]);

  lexicalUpdate(() => note0.moveDown());
  await expect(editor).toMatchNoteTree([
    { text: "note1", children: [{ text: "sub note 1" }] },
    { text: "note0", children: [{ text: "sub note 0" }] },
  ]);

  lexicalUpdate(() => note0.moveDown());
  await expect(editor).toMatchNoteTree([
    { text: "note1", children: [{ text: "sub note 1" }] },
    { text: "note0", children: [{ text: "sub note 0" }] },
  ]);

  lexicalUpdate(() => note0.moveUp());
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "sub note 0" }] },
    { text: "note1", children: [{ text: "sub note 1" }] },
  ]);

  lexicalUpdate(() => note0.moveUp());
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "sub note 0" }] },
    { text: "note1", children: [{ text: "sub note 1" }] },
  ]);
});

it("change parent by moving up/down", async ({
  load,
  editor,
  expect,
  lexicalUpdate,
}) => {
  const { note0, subNote0, note1, subNote1 } = load("tree");

  await expect(editor).toMatchFileSnapshot("base.yml");
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "sub note 0" }] },
    { text: "note1", children: [{ text: "sub note 1" }] },
  ]);

  lexicalUpdate(() => {
    expect([...note0.children].map((n) => n.lexicalKey)).toEqual([
      subNote0.lexicalKey,
    ]);
    expect([...note1.children].map((n) => n.lexicalKey)).toEqual([
      subNote1.lexicalKey,
    ]);
    subNote0.moveDown();
    expect([...note0.children].map((n) => n.lexicalKey)).toEqual([]);
    expect([...note1.children].map((n) => n.lexicalKey)).toEqual([
      subNote0.lexicalKey,
      subNote1.lexicalKey,
    ]);
  });
  await expect(editor).toMatchNoteTree([
    { text: "note0" },
    {
      text: "note1",
      children: [{ text: "sub note 0" }, { text: "sub note 1" }],
    },
  ]);

  lexicalUpdate(() => {
    subNote0.moveUp();
    expect([...note0.children].map((n) => n.lexicalKey)).toEqual([
      subNote0.lexicalKey,
    ]);
    expect([...note1.children].map((n) => n.lexicalKey)).toEqual([
      subNote1.lexicalKey,
    ]);
  });
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "sub note 0" }] },
    { text: "note1", children: [{ text: "sub note 1" }] },
  ]);

  lexicalUpdate(() => subNote0.moveUp());
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "sub note 0" }] },
    { text: "note1", children: [{ text: "sub note 1" }] },
  ]);

  lexicalUpdate(() => {
    subNote1.moveUp();
    expect([...note0.children].map((n) => n.lexicalKey)).toEqual([
      subNote0.lexicalKey,
      subNote1.lexicalKey,
    ]);
    expect([...note1.children].map((n) => n.lexicalKey)).toEqual([]);
  });
  await expect(editor).toMatchNoteTree([
    {
      text: "note0",
      children: [{ text: "sub note 0" }, { text: "sub note 1" }],
    },
    { text: "note1" },
  ]);

  lexicalUpdate(() => {
    subNote1.moveDown();
    expect([...note0.children].map((n) => n.lexicalKey)).toEqual([
      subNote0.lexicalKey,
    ]);
    expect([...note1.children].map((n) => n.lexicalKey)).toEqual([
      subNote1.lexicalKey,
    ]);
  });
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "sub note 0" }] },
    { text: "note1", children: [{ text: "sub note 1" }] },
  ]);
});
