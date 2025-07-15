import "./common";
import { Note } from "@/components/Editor/plugins/remdo/utils/api";
import { it } from "vitest";

it("reorder flat", async ({ load, editor, expect, lexicalUpdate }) => {
  const { note0 } = load("flat");
  await expect(editor).toMatchFileSnapshot("base.yml");

  lexicalUpdate(() => note0.moveDown());
  await expect(editor).toMatchFileSnapshot("note0-down-x1.yml");

  lexicalUpdate(() => note0.moveDown());
  await expect(editor).toMatchFileSnapshot("note0-down-x2.yml");

  lexicalUpdate(() => note0.moveDown()); //noop
  await expect(editor).toMatchFileSnapshot("note0-down-x2.yml");

  lexicalUpdate(() => note0.moveUp());
  await expect(editor).toMatchFileSnapshot("note0-down-x1.yml");

  lexicalUpdate(() => note0.moveUp());
  await expect(editor).toMatchFileSnapshot("base.yml");

  lexicalUpdate(() => note0.moveUp()); //noop
  await expect(editor).toMatchFileSnapshot("base.yml");
});

it("reorder tree", async ({ load, editor, expect, lexicalUpdate }) => {
  const { note0 } = load("tree");
  await expect(editor).toMatchFileSnapshot("base.yml");

  lexicalUpdate(() => note0.moveDown());
  await expect(editor).toMatchFileSnapshot("note0-down.yml");

  lexicalUpdate(() => note0.moveDown()); //noop
  await expect(editor).toMatchFileSnapshot("note0-down.yml");

  lexicalUpdate(() => note0.moveUp());
  await expect(editor).toMatchFileSnapshot("base.yml");

  lexicalUpdate(() => note0.moveUp()); //noop
  await expect(editor).toMatchFileSnapshot("base.yml");
});

it("change parent by moving up/down", async ({
  load,
  editor,
  expect,
  lexicalUpdate,
}) => {
  const { note0, subNote0, note1, subNote1 } = load("tree");
  const children = (n: Note) => [...n.children].map((n) => n.lexicalKey);

  await expect(editor).toMatchFileSnapshot("base.yml");

  lexicalUpdate(() => {
    expect(children(note0)).toEqual([subNote0.lexicalKey]);
    expect(children(note1)).toEqual([subNote1.lexicalKey]);

    subNote0.moveDown();
    expect(children(note0)).toEqual([]);
    expect(children(note1)).toEqual([subNote0.lexicalKey, subNote1.lexicalKey]);
  });
  await expect(editor).toMatchFileSnapshot("subNote0-down.yml");

  lexicalUpdate(() => {
    subNote0.moveUp();
    expect(children(note0)).toEqual([subNote0.lexicalKey]);
    expect(children(note1)).toEqual([subNote1.lexicalKey]);
  });
  await expect(editor).toMatchFileSnapshot("base.yml");

  lexicalUpdate(() => subNote0.moveUp()); //noop
  await expect(editor).toMatchFileSnapshot("base.yml");

  lexicalUpdate(() => {
    subNote1.moveUp();
    expect(children(note0)).toEqual([subNote0.lexicalKey, subNote1.lexicalKey]);
    expect(children(note1)).toEqual([]);
  });
  await expect(editor).toMatchFileSnapshot("subNote1-up.yml");

  lexicalUpdate(() => {
    subNote1.moveDown();
    expect(children(note0)).toEqual([subNote0.lexicalKey]);
    expect(children(note1)).toEqual([subNote1.lexicalKey]);
  });
  await expect(editor).toMatchFileSnapshot("base.yml");
});
