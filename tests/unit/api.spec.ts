import "./common";
import { it } from "vitest";

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
