import { expect } from "vitest";
import type { MatcherState } from "@vitest/expect";
import { $getRoot } from "lexical";
import { Note } from "@/components/Editor/plugins/remdo/utils/api";
import type { RemdoLexicalEditor } from "@/components/Editor/plugins/remdo/ComposerContext";
import type { Queries } from "./test_context";
import { getVisibleNotes } from "./utils";

type NoteTreeNode = {
  text: string;
  children?: NoteTreeSnapshot;
  checked?: true;
  folded?: true;
};

export type NoteTreeSnapshot = NoteTreeNode[];

function captureNoteTree(editor: RemdoLexicalEditor): NoteTreeSnapshot {
  let snapshot: NoteTreeSnapshot = [];
  editor.update(() => {
    const root = Note.from($getRoot());
    snapshot = [...root.children].map(toSnapshotNode);
  });
  return snapshot;
}

function toSnapshotNode(note: Note): NoteTreeNode {
  const children = [...note.children].map(toSnapshotNode);
  const node: NoteTreeNode = {
    text: note.text,
  };
  if (children.length > 0) {
    node.children = children;
  }
  if (note.checked) {
    node.checked = true;
  }
  if (note.folded) {
    node.folded = true;
  }
  return node;
}

expect.extend({
  toMatchNoteTree(this: MatcherState, editor: RemdoLexicalEditor, expected: NoteTreeSnapshot) {
    const actual = captureNoteTree(editor);
    const matches = this.equals(actual, expected);
    const pass = this.isNot ? !matches : matches;

    return {
      pass,
      message: () => {
        const hint = this.utils.matcherHint(
          `${this.isNot ? ".not." : ""}toMatchNoteTree`,
          "editor",
          "expected",
        );
        const expectedString = this.utils.printExpected(expected);
        const receivedString = this.utils.printReceived(actual);
        const expectation = this.isNot
          ? "Expected editor note tree not to match"
          : "Expected editor note tree to match";
        return `${hint}\n\n${expectation}:\n  ${expectedString}\nReceived:\n  ${receivedString}`;
      },
    };
  },
  toShowNotes(this: MatcherState, queries: Queries, expected: string[]) {
    const actual = getVisibleNotes(queries);
    const matches = this.equals(actual, expected);
    const pass = this.isNot ? !matches : matches;

    return {
      pass,
      message: () => {
        const hint = this.utils.matcherHint(
          `${this.isNot ? ".not." : ""}toShowNotes`,
          "queries",
          "expected",
        );
        const expectedString = this.utils.printExpected(expected);
        const receivedString = this.utils.printReceived(actual);
        const expectation = this.isNot
          ? "Expected visible notes not to equal"
          : "Expected visible notes to equal";
        return `${hint}\n\n${expectation}:\n  ${expectedString}\nReceived:\n  ${receivedString}`;
      },
    };
  },
  toHaveClasses(this: MatcherState, element: Element, expectedClasses: string[]) {
    const classList = Array.from(element.classList);
    const required = Array.from(new Set(expectedClasses));
    const hasAll = required.every((cls) => element.classList.contains(cls));
    const pass = this.isNot ? !hasAll : hasAll;

    return {
      pass,
      message: () => {
        const hint = this.utils.matcherHint(
          `${this.isNot ? ".not." : ""}toHaveClasses`,
          "element",
          "expected",
        );
        const expectedString = this.utils.printExpected(required.sort());
        const receivedString = this.utils.printReceived(classList.sort());
        const expectation = this.isNot
          ? "Expected element classes not to contain"
          : "Expected element classes to contain";
        return `${hint}\n\n${expectation}:\n  ${expectedString}\nReceived:\n  ${receivedString}`;
      },
    };
  },
});

declare module "vitest" {
  interface Assertion<T = any> {
    toMatchNoteTree(expected: NoteTreeSnapshot): T extends Promise<any> ? Promise<void> : void;
    toShowNotes(expected: string[]): T extends Promise<any> ? Promise<void> : void;
    toHaveClasses(expected: string[]): T extends Promise<any> ? Promise<void> : void;
  }
  interface AsymmetricMatchersContaining {
    toMatchNoteTree(expected: NoteTreeSnapshot): void;
    toShowNotes(expected: string[]): void;
    toHaveClasses(expected: string[]): void;
  }
}
