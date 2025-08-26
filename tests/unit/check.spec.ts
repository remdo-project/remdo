import "./common";
//imported for side effects
import { it } from "vitest";

it("check/uncheck", async ({ load, editor, expect, lexicalUpdate }) => {
  const { note0 } = load("single");
  await expect(editor).toMatchFileSnapshot("base.yml");

  lexicalUpdate(() => (note0.checked = true));
  await expect(editor).toMatchFileSnapshot("checked.yml");

  lexicalUpdate(() => (note0.checked = false));
  await expect(editor).toMatchFileSnapshot("base.yml");
});

it("toggle check", async ({ load, editor, expect, lexicalUpdate }) => {
  const { note0 } = load("single");
  await expect(editor).toMatchFileSnapshot("base.yml");

  lexicalUpdate(() => note0.toggleChecked());
  await expect(editor).toMatchFileSnapshot("checked.yml");

  lexicalUpdate(() => note0.toggleChecked());
  await expect(editor).toMatchFileSnapshot("base.yml");
});

it("check/uncheck recursively", async ({
  load,
  editor,
  expect,
  lexicalUpdate,
}) => {
  const { note0, note00 } = load("basic");
  await expect(editor).toMatchFileSnapshot("base.yml");
  lexicalUpdate(() => {
    expect(note0.checked).toBeFalsy();
    expect(note00.checked).toBeFalsy();
  });

  lexicalUpdate(() => {
    note0.checked = true;
    expect(note0.checked).toBeTruthy();
    expect(note00.checked).toBeTruthy();
  });
  await expect(editor).toMatchFileSnapshot("checked.yml");

  lexicalUpdate(() => {
    note0.checked = false;
    expect(note0.checked).toBeFalsy();
    expect(note00.checked).toBeFalsy();
  });
  await expect(editor).toMatchFileSnapshot("base.yml");
});

it("toggle check recursively", async ({
  load,
  editor,
  expect,
  lexicalUpdate,
}) => {
  const { note0, note00 } = load("basic");
  await expect(editor).toMatchFileSnapshot("base.yml");
  lexicalUpdate(() => {
    expect(note0.checked).toBeFalsy();
    expect(note00.checked).toBeFalsy();
  });

  lexicalUpdate(() => {
    note0.toggleChecked();
    expect(note0.checked).toBeTruthy();
    expect(note00.checked).toBeTruthy();
  });
  await expect(editor).toMatchFileSnapshot("checked.yml");

  lexicalUpdate(() => {
    note0.toggleChecked();
    expect(note0.checked).toBeFalsy();
    expect(note00.checked).toBeFalsy();
  });
  await expect(editor).toMatchFileSnapshot("base.yml");
});

it("check/uncheck recursively mixed", async ({
  load,
  expect,
  lexicalUpdate,
}) => {
  const { note0, note00 } = load("basic");
  lexicalUpdate(() => {
    note00.checked = true;
    expect(note0.checked).toBeFalsy();
    expect(note00.checked).toBeTruthy();

    note0.toggleChecked();
    expect(note0.checked).toBeTruthy();
    expect(note00.checked).toBeTruthy();

    note0.toggleChecked();
    expect(note0.checked).toBeFalsy();
    expect(note00.checked).toBeFalsy();
  });
});
