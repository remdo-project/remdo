import "../common";
import { expect, it } from "vitest";
import { getCurrentTest } from "vitest/suite";
import type { TestContext } from "vitest";

function getTestContext(): TestContext {
  const test = getCurrentTest() ?? expect.getState().test;
  if (!test?.context) {
    throw new Error("Missing test context");
  }
  return test.context as TestContext;
}

const baseFlatTree = [
  { text: "note0" },
  { text: "note1" },
  { text: "note2" },
];

const reorderFlatSteps = [
  {
    name: "move note0 down once",
    action: ({ note0 }: Record<string, any>) => note0.moveDown(),
    expected: [
      { text: "note1" },
      { text: "note0" },
      { text: "note2" },
    ],
  },
  {
    name: "move note0 below note2",
    action: ({ note0 }: Record<string, any>) => note0.moveDown(),
    expected: [
      { text: "note1" },
      { text: "note2" },
      { text: "note0" },
    ],
  },
  {
    name: "moving past the end keeps order",
    action: ({ note0 }: Record<string, any>) => note0.moveDown(),
    expected: [
      { text: "note1" },
      { text: "note2" },
      { text: "note0" },
    ],
  },
  {
    name: "move note0 up from bottom",
    action: ({ note0 }: Record<string, any>) => note0.moveUp(),
    expected: [
      { text: "note1" },
      { text: "note0" },
      { text: "note2" },
    ],
  },
  {
    name: "move note0 back to the top",
    action: ({ note0 }: Record<string, any>) => note0.moveUp(),
    expected: baseFlatTree,
  },
  {
    name: "moving above the first note keeps order",
    action: ({ note0 }: Record<string, any>) => note0.moveUp(),
    expected: baseFlatTree,
  },
].map((step, index) => ({ ...step, index }));

it.each(reorderFlatSteps)(
  "reorder flat %s",
  async function ({ index, expected }) {
    const { load, editor, lexicalUpdate, expect: expectWithContext } =
      getTestContext();
    const assertion = expectWithContext ?? expect;
    const notes = load("flat");

    await assertion(editor).toMatchNoteTree(baseFlatTree);

    for (let i = 0; i <= index; i += 1) {
      lexicalUpdate(() => reorderFlatSteps[i].action(notes));
    }

    await assertion(editor).toMatchNoteTree(expected);
  },
);

const baseTree = [
  { text: "note0", children: [{ text: "sub note 0" }] },
  { text: "note1", children: [{ text: "sub note 1" }] },
];

const reorderTreeSteps = [
  {
    name: "move note0 below note1",
    action: ({ note0 }: Record<string, any>) => note0.moveDown(),
    expected: [
      { text: "note1", children: [{ text: "sub note 1" }] },
      { text: "note0", children: [{ text: "sub note 0" }] },
    ],
  },
  {
    name: "moving past the last note keeps order",
    action: ({ note0 }: Record<string, any>) => note0.moveDown(),
    expected: [
      { text: "note1", children: [{ text: "sub note 1" }] },
      { text: "note0", children: [{ text: "sub note 0" }] },
    ],
  },
  {
    name: "move note0 back above note1",
    action: ({ note0 }: Record<string, any>) => note0.moveUp(),
    expected: baseTree,
  },
  {
    name: "moving above the first note keeps order",
    action: ({ note0 }: Record<string, any>) => note0.moveUp(),
    expected: baseTree,
  },
].map((step, index) => ({ ...step, index }));

it.each(reorderTreeSteps)(
  "reorder tree %s",
  async function ({ index, expected }) {
    const { load, editor, lexicalUpdate, expect: expectWithContext } =
      getTestContext();
    const assertion = expectWithContext ?? expect;
    const notes = load("tree");

    await assertion(editor).toMatchNoteTree(baseTree);

    for (let i = 0; i <= index; i += 1) {
      lexicalUpdate(() => reorderTreeSteps[i].action(notes));
    }

    await assertion(editor).toMatchNoteTree(expected);
  },
);

it("change parent by moving up/down", async ({
  load,
  editor,
  expect,
  lexicalUpdate,
}) => {
  const { note0, subNote0, note1, subNote1 } = load("tree");

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

it("move + reorder preserves subtree and IDs", async ({
  load,
  editor,
  expect,
  lexicalUpdate,
}) => {
  const { note0, subNote0, note1, subNote1 } = load("tree");
  let initialIDs: Record<string, string> = {};

  lexicalUpdate(() => {
    initialIDs = {
      note0: note0.id,
      note1: note1.id,
      subNote0: subNote0.id,
      subNote1: subNote1.id,
    };
  });

  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "sub note 0" }] },
    { text: "note1", children: [{ text: "sub note 1" }] },
  ]);

  lexicalUpdate(() => {
    note1.indent();
  });

  await expect(editor).toMatchNoteTree([
    {
      text: "note0",
      children: [
        { text: "sub note 0" },
        { text: "note1", children: [{ text: "sub note 1" }] },
      ],
    },
  ]);

  lexicalUpdate(() => {
    note1.moveUp();
  });

  await expect(editor).toMatchNoteTree([
    {
      text: "note0",
      children: [
        { text: "note1", children: [{ text: "sub note 1" }] },
        { text: "sub note 0" },
      ],
    },
  ]);

  lexicalUpdate(() => {
    expect(note0.id).toBe(initialIDs.note0);
    expect(note1.id).toBe(initialIDs.note1);
    expect(subNote0.id).toBe(initialIDs.subNote0);
    expect(subNote1.id).toBe(initialIDs.subNote1);

    expect([...note1.children].map((child) => child.id)).toEqual([
      initialIDs.subNote1,
    ]);
    expect([...note0.children].map((child) => child.id)).toEqual([
      initialIDs.note1,
      initialIDs.subNote0,
    ]);
  });
});
