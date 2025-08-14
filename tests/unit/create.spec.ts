import "./common"; //imported for side effects
import { INSERT_PARAGRAPH_COMMAND } from "lexical";
import { it } from "vitest";

it("minimize", async ({ load, editor, expect }) => {
  load("basic");
  await expect(editor).toMatchFileSnapshot("basic.yml");
});

it("set text", async ({ load, lexicalUpdate, expect }) => {
  const { note0 } = load("basic");
  lexicalUpdate(() => {
    expect(note0.text).toBe("note0");

    const newNoteText = "note0 - modified";
    note0.text = newNoteText;
    expect(note0.text).toBe(newNoteText);
  });
});

it("insert paragraph after a note with children", async ({ load, lexicalUpdate, editor, expect }) => {
  const { note0 } = load("basic");
  lexicalUpdate(() => {
    note0.lexicalNode.getFirstChild()?.selectEnd();
  });
  editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
  await expect(editor).toMatchFileSnapshot("inserted.yml");
});

it("insert paragraph after a folded note", async ({ load, lexicalUpdate, editor, expect }) => {
  const { note0 } = load("folded");
  lexicalUpdate(() => {
    note0.lexicalNode.getFirstChild()?.selectEnd();
  });
  editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
  logger.preview();
  await expect(editor).toMatchFileSnapshot("inserted.yml");
});
