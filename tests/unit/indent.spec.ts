import "./common";
import { it } from "vitest";

it("indent", async ({ load, editor, expect, lexicalUpdate }) => {
  const { note0, note1, note2 } = load("flat");

  await expect(editor).toMatchFileSnapshot("base.yml");
  lexicalUpdate(() => note0.indent()); //noop
  await expect(editor).toMatchFileSnapshot("base.yml");
  lexicalUpdate(() => note1.indent());
  await expect(editor).toMatchFileSnapshot("node1_indent.yml");
  lexicalUpdate(() => note2.indent());
  await expect(editor).toMatchFileSnapshot("node2_indent.yml");
  lexicalUpdate(() => note2.indent());
  await expect(editor).toMatchFileSnapshot("node2_indent_twice.yml");
  lexicalUpdate(() => note2.indent()); //noop
  await expect(editor).toMatchFileSnapshot("node2_indent_twice.yml");
  lexicalUpdate(() => note1.outdent());
  await expect(editor).toMatchFileSnapshot("node2_indent_2.yml");
  lexicalUpdate(() => note1.outdent()); //noop
  await expect(editor).toMatchFileSnapshot("node2_indent_2.yml");
});
