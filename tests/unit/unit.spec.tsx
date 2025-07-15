//TODO refactor using loadEditorState
import { createChildren } from "./common";
import { Note, NotesState } from "@/components/Editor/plugins/remdo/utils/api";
import { $isListNode, $isListItemNode } from "@lexical/list";
import { $createTextNode, $getRoot, $setSelection, ElementNode } from "lexical";
import { describe, it, expect, beforeEach } from "vitest";

/** Runs test in Lexical editor update context */
export function testUpdate(
  title: string,
  fn: ({ root, context, rootNode }) => void,
  // eslint-disable-next-line @typescript-eslint/ban-types
  runner: Function = it
) {
  if (fn.constructor.name == "AsyncFunction") {
    throw Error("Async functions can't be wrapped with update");
  }
  return runner(title, (context: TestContext) => {
    context.lexicalUpdate(() => {
      const rootNode = $getRoot();
      fn({ context, root: Note.from(rootNode), rootNode });
    });
  });
}

testUpdate.only = (title: string, fn) => {
  testUpdate(title, fn, it.only);
};

testUpdate.skip = (title: string, fn) => {
  testUpdate(title, fn, it.skip);
};

function checkChildren(
  notes: Array<Note>,
  expectedChildrenArrays: Array<Array<Note>>
) {
  let expectedCount = 0;
  notes.forEach((note, idx) => {
    const expectedChildren = expectedChildrenArrays[idx] || [];
    expectedCount += expectedChildren.length;
    //note.text and idx are added in case of an error, so it's easier to notice which node causes the issue
    expect([note.text, idx, ...note.children]).toStrictEqual([
      note.text,
      idx,
      ...expectedChildren,
    ]);
    expect(note.hasChildren).toEqual(expectedChildren.length > 0);
    for (const child of note.children) {
      expect(child).toBeInstanceOf(Note);
    }
  });
  expect(notes).toHaveLength(expectedCount + 1); //+1 for root which is not listed as a child
}

describe("API", async () => {
  beforeEach(async (context) => {
    context.lexicalUpdate(() => {
      $getRoot().clear();
    });
    //this have to be a separate, discrete update, so appropriate listener can
    //be fired afterwards and create the default root note
    context.lexicalUpdate(() => {
      $getRoot()
        .getChildren()
        .find($isListNode)
        .getFirstChildOrThrow()
        .append($createTextNode("note0"));

      //otherwise we can get some errors about missing functions in the used
      //DOM implementation
      $setSelection(null);
    });
  });

  testUpdate("create notes", ({ rootNode }) => {
    expect(rootNode.getChildrenSize()).toEqual(1);
    expect(rootNode.getChildren()[0]).toSatisfy($isListNode);

    const listNode: ElementNode = rootNode.getFirstChild();
    expect(listNode.getChildrenSize()).toEqual(1);
    expect(listNode.getChildren()[0]).toSatisfy($isListItemNode);

    const liNode: ElementNode = listNode.getFirstChild();
    expect(liNode.getChildrenSize()).toBe(1);
  });

  testUpdate("create notes", ({ root }) => {
    const note0 = [...root.children][0];
    const notes = [root, note0];

    checkChildren(notes, [[note0]]);

    const note1 = note0.createChild("note1");
    notes.push(note1);
    checkChildren(notes, [[note0], [note1]]);
    expect(note1.text).toEqual("note1");

    const note2 = note0.createChild();
    notes.push(note2);
    checkChildren(notes, [[note0], [note1, note2]]);
    expect(note2.text).toEqual("");
  });

  testUpdate("indent and outdent", ({ root }) => {
    expect([...root.children].length).toEqual(1);

    const [notes, note0, note1, note2] = createChildren(root, 2);
    checkChildren(notes, [[note0, note1, note2]]);

    note1.indent();
    checkChildren(notes, [[note0, note2], [note1]]);

    note1.indent(); //no effect
    checkChildren(notes, [[note0, note2], [note1]]);

    note2.indent();
    checkChildren(notes, [[note0], [note1, note2]]);

    note2.indent();
    checkChildren(notes, [[note0], [note1], [note2]]);

    note2.indent(); //no effect
    checkChildren(notes, [[note0], [note1], [note2]]);

    note2.outdent();
    checkChildren(notes, [[note0], [note1, note2]]);

    note2.outdent();
    checkChildren(notes, [[note0, note2], [note1]]);

    note2.outdent(); //no effect
    checkChildren(notes, [[note0, note2], [note1]]);

    note1.outdent();
    checkChildren(notes, [[note0, note1, note2]]);
  });

  testUpdate("indent and out with children", ({ root }) => {
    expect([...root.children].length).toEqual(1);

    const [notes, note0, note1, note2, note3, note4] = createChildren(root, 4);
    checkChildren(notes, [[note0, note1, note2, note3, note4]]);

    note3.indent();
    checkChildren(notes, [[note0, note1, note2, note4], [], [], [note3]]);

    note2.indent();
    checkChildren(notes, [[note0, note1, note4], [], [note2], [note3]]);

    note2.outdent();
    checkChildren(notes, [[note0, note1, note2, note4], [], [], [note3]]);
  });

  it.fails("focus and add children", (context) => {
    context.lexicalUpdate(() => {
      const root = Note.from($getRoot());
      const note0 = [...root.children][0];
      note0.focus();
    });

    //note0
    expect(context.queries.getAllNotNestedIListItems()).toHaveLength(1);

    context.lexicalUpdate(() => {
      const root = Note.from($getRoot());
      const note0 = [...root.children][0];
      note0.createChild("note1");
      root.createChild("note2");
    });

    //note0, note1
    //note2 should be filtered out as it's not a child of focused node
    expect(context.queries.getAllNotNestedIListItems()).toHaveLength(2);
    context.lexicalUpdate(() => {
      const root = Note.from($getRoot());
      root.focus();
    });
    //note0, note1, note2
    expect(context.queries.getAllNotNestedIListItems()).toHaveLength(3);
  });

  it("fold", async (context) => {
    context.lexicalUpdate(() => {
      const root = Note.from($getRoot());
      const [notes, note0, note1, note2, note3] = createChildren(root, 3);
      note2.indent();
      note1.indent();
      note0.folded = true;
    });
    //TODO check visibility once folding changes rendering instead of just hiding via css
  });

  it.skip("focus and filter", null);

  it.skip("playground", (context) => {
    context.lexicalUpdate(() => {
      const root = Note.from($getRoot());
      //const note0 = [...root.children][0];
      createChildren(root, 3);
    });
  });
});
