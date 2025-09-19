import "./common";
//imported for side effects
import { it } from "vitest";

it("check/uncheck", async ({ load, editor, expect, lexicalUpdate }) => {
  const { note0 } = load("single");
  await expect(editor).toMatchFileSnapshot("base.yml");
  await expect(editor).toMatchNoteTree([{ text: "note0" }]);

  lexicalUpdate(() => {
    note0.checked = true;
    expect(note0.checked).toBe(true);
  });
  await expect(editor).toMatchNoteTree([{ text: "note0", checked: true }]);

  lexicalUpdate(() => {
    note0.checked = false;
    expect(note0.checked).toBe(false);
  });
  await expect(editor).toMatchNoteTree([{ text: "note0" }]);
});

it("toggle check", async ({ load, editor, expect, lexicalUpdate }) => {
  const { note0 } = load("single");
  await expect(editor).toMatchNoteTree([{ text: "note0" }]);

  lexicalUpdate(() => {
    note0.toggleChecked();
    expect(note0.checked).toBe(true);
  });
  await expect(editor).toMatchNoteTree([{ text: "note0", checked: true }]);

  lexicalUpdate(() => {
    note0.toggleChecked();
    expect(note0.checked).toBe(false);
  });
  await expect(editor).toMatchNoteTree([{ text: "note0" }]);
});

it("check/uncheck recursively", async ({
  load,
  editor,
  expect,
  lexicalUpdate,
}) => {
  const { note0, note00 } = load("basic");
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "note00" }] },
  ]);
  lexicalUpdate(() => {
    expect(note0.checked).toBe(false);
    expect(note00.checked).toBe(false);
  });

  lexicalUpdate(() => {
    note0.checked = true;
    expect(note0.checked).toBe(true);
    expect(note00.checked).toBe(true);
  });
  await expect(editor).toMatchNoteTree([
    { text: "note0", checked: true, children: [{ text: "note00", checked: true }] },
  ]);

  lexicalUpdate(() => {
    note0.checked = false;
    expect(note0.checked).toBe(false);
    expect(note00.checked).toBe(false);
  });
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "note00" }] },
  ]);
});

it("toggle check recursively", async ({
  load,
  editor,
  expect,
  lexicalUpdate,
}) => {
  const { note0, note00 } = load("basic");
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "note00" }] },
  ]);
  lexicalUpdate(() => {
    expect(note0.checked).toBe(false);
    expect(note00.checked).toBe(false);
  });

  lexicalUpdate(() => {
    note0.toggleChecked();
    expect(note0.checked).toBe(true);
    expect(note00.checked).toBe(true);
  });
  await expect(editor).toMatchNoteTree([
    { text: "note0", checked: true, children: [{ text: "note00", checked: true }] },
  ]);

  lexicalUpdate(() => {
    note0.toggleChecked();
    expect(note0.checked).toBe(false);
    expect(note00.checked).toBe(false);
  });
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "note00" }] },
  ]);
});

it("stores checked state outside lexical checklist flag", async ({
  load,
  lexicalUpdate,
  expect,
}) => {
  const { note0 } = load("single");

  lexicalUpdate(() => {
    note0.toggleChecked();
    expect(note0.checked).toBe(true);
    expect(note0.lexicalNode.getChecked()).toBeUndefined();
  });
});

it("check/uncheck recursively mixed", async ({
  load,
  expect,
  lexicalUpdate,
}) => {
  const { note0, note00 } = load("basic");
  lexicalUpdate(() => {
    note00.checked = true;
    expect(note0.checked).toBe(false);
    expect(note00.checked).toBe(true);

    note0.toggleChecked();
    expect(note0.checked).toBe(true);
    expect(note00.checked).toBe(true);

    note0.toggleChecked();
    expect(note0.checked).toBe(false);
    expect(note00.checked).toBe(false);
  });
});
