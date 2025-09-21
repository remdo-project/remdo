// @ts-nocheck
// TODO(remdo): Rewrite indent tests with explicit mocks so TypeScript can infer matcher state properly.
import "./common";
import { expect, it } from "vitest";
import { getCurrentTest } from "vitest/suite";
import type { TestContext } from "vitest";

const baseFlatTree = [
  { text: "note0" },
  { text: "note1" },
  { text: "note2" },
];

const indentSteps = [
  {
    name: "indent note0 keeps all notes at the root",
    action: ({ note0 }: Record<string, any>) => note0.indent(),
    expected: baseFlatTree,
  },
  {
    name: "indent note1 nests it under note0",
    action: ({ note1 }: Record<string, any>) => note1.indent(),
    expected: [
      { text: "note0", children: [{ text: "note1" }] },
      { text: "note2" },
    ],
  },
  {
    name: "indent note2 nests it under note0",
    action: ({ note2 }: Record<string, any>) => note2.indent(),
    expected: [
      { text: "note0", children: [{ text: "note1" }, { text: "note2" }] },
    ],
  },
  {
    name: "indent note2 again nests it under note1",
    action: ({ note2 }: Record<string, any>) => note2.indent(),
    expected: [
      {
        text: "note0",
        children: [
          {
            text: "note1",
            children: [{ text: "note2" }],
          },
        ],
      },
    ],
  },
  {
    name: "outdent note1 moves it back to the root",
    action: ({ note1 }: Record<string, any>) => note1.outdent(),
    expected: [
      { text: "note0" },
      { text: "note1", children: [{ text: "note2" }] },
    ],
  },
  {
    name: "outdent note1 again is a no-op",
    action: ({ note1 }: Record<string, any>) => note1.outdent(),
    expected: [
      { text: "note0" },
      { text: "note1", children: [{ text: "note2" }] },
    ],
  },
].map((step, index) => ({ ...step, index }));

function getTestContext(): TestContext {
  const test = getCurrentTest() ?? expect.getState().test;
  if (!test?.context) {
    throw new Error("Missing test context");
  }
  return test.context as TestContext;
}

it.each(indentSteps)(
  "indent %s",
  async function ({ index, expected }) {
    const { load, editor, lexicalUpdate, expect: expectWithContext } =
      getTestContext();
    const assertion = expectWithContext ?? expect;
    const notes = load("flat");

    await assertion(editor).toMatchNoteTree(baseFlatTree);

    for (let i = 0; i <= index; i += 1) {
      lexicalUpdate(() => indentSteps[i].action(notes));
    }

    await assertion(editor).toMatchNoteTree(expected);
  },
);
