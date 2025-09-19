import "./common";
import { it } from "vitest";

it("indent", async ({ load, editor, expect, lexicalUpdate }) => {
  const { note0, note1, note2 } = load("flat");

  await expect(editor).toMatchFileSnapshot("base.yml");
  await expect(editor).toMatchNoteTree([
    { text: "note0" },
    { text: "note1" },
    { text: "note2" },
  ]);

  lexicalUpdate(() => note0.indent());
  await expect(editor).toMatchNoteTree([
    { text: "note0" },
    { text: "note1" },
    { text: "note2" },
  ]);

  lexicalUpdate(() => note1.indent());
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "note1" }] },
    { text: "note2" },
  ]);

  lexicalUpdate(() => note2.indent());
  await expect(editor).toMatchNoteTree([
    { text: "note0", children: [{ text: "note1" }, { text: "note2" }] },
  ]);

  lexicalUpdate(() => note2.indent());
  await expect(editor).toMatchNoteTree([
    {
      text: "note0",
      children: [
        {
          text: "note1",
          children: [{ text: "note2" }],
        },
      ],
    },
  ]);

  lexicalUpdate(() => note1.outdent());
  await expect(editor).toMatchNoteTree([
    { text: "note0" },
    { text: "note1", children: [{ text: "note2" }] },
  ]);

  lexicalUpdate(() => note1.outdent());
  await expect(editor).toMatchNoteTree([
    { text: "note0" },
    { text: "note1", children: [{ text: "note2" }] },
  ]);
});
