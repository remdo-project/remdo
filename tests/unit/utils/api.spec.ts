import "../common";
import { it } from "vitest";
import { Note } from "@/components/Editor/plugins/remdo/utils/api";

it("api", async ({ load, expect, lexicalUpdate }) => {
  const { root, note0, subNote0, note1, subNote1 } = load("tree");

  const childrenKeys = (n) => [...n.children].map((n) => n.lexicalKey);

  lexicalUpdate(() => {
    expect(root.parent).toBeNull();
    expect(note0.parent.lexicalKey).toEqual(root.lexicalKey);
    expect(note0.nextSibling.lexicalKey).toEqual(note1.lexicalKey);
    expect(note0.prevSibling).toBeNull();
    expect(childrenKeys(note0)).toEqual([subNote0.lexicalKey]);
    expect(subNote0.parent.lexicalKey).toEqual(note0.lexicalKey);
    expect(subNote0.nextSibling).toBeNull();
    expect(subNote0.prevSibling).toBeNull();
    expect(childrenKeys(subNote0)).toEqual([]);
    expect(note1.prevSibling.lexicalKey).toEqual(note0.lexicalKey);
  });
});

it("exposes children iterables and hasChildren state", async ({
  load,
  expect,
  lexicalUpdate,
}) => {
  const { root, note0, note00 } = load("basic");

  lexicalUpdate(() => {
    const topLevelNotes = [...root.children];
    expect(topLevelNotes).toHaveLength(1);
    expect(topLevelNotes[0]).toBeInstanceOf(Note);
    expect(topLevelNotes[0].lexicalKey).toEqual(note0.lexicalKey);
    expect(root.hasChildren).toBe(true);

    const initialChildren = [...note0.children];
    expect(initialChildren).toHaveLength(1);
    expect(initialChildren[0]).toBeInstanceOf(Note);
    expect(initialChildren[0].lexicalKey).toEqual(note00.lexicalKey);
    expect(note0.hasChildren).toBe(true);

    expect([...note00.children]).toEqual([]);
    expect(note00.hasChildren).toBe(false);
  });

  let createdNote01: Note;
  lexicalUpdate(() => {
    createdNote01 = note0.createChild("note01");
    expect(createdNote01).toBeInstanceOf(Note);
    expect(createdNote01.text).toBe("note01");
  });

  lexicalUpdate(() => {
    const childTexts = [...note0.children].map((child) => child.text);
    expect(childTexts).toEqual(["note00", "note01"]);
    expect(note0.hasChildren).toBe(true);
  });

  let createdNote02: Note;
  lexicalUpdate(() => {
    createdNote02 = note0.createChild();
    expect(createdNote02).toBeInstanceOf(Note);
    expect(createdNote02.text).toBe("");
  });

  lexicalUpdate(() => {
    const childTexts = [...note0.children].map((child) => child.text);
    expect(childTexts).toEqual(["note00", "note01", ""]);
    for (const child of note0.children) {
      expect(child).toBeInstanceOf(Note);
    }
    expect(note0.hasChildren).toBe(true);
    expect(createdNote01.hasChildren).toBe(false);
    expect(createdNote02.hasChildren).toBe(false);
  });
});
