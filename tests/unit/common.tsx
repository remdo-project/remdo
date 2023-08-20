import Editor from "@/components/Editor";
import { NotesLexicalEditor } from "@/components/Editor/lexical/NotesComposerContext";
import { Note } from "@/components/Editor/lexical/api";
import { TestContext as ComponentTestContext } from "@/components/Editor/plugins/DevComponentTestPlugin";
import { Layout } from "@/components/Layout";
import {
  BoundFunctions,
  getAllByRole,
  queries,
  render,
  RenderResult,
  within,
} from "@testing-library/react";
import fs from "fs";
import yaml from "js-yaml";
import { $getRoot, CLEAR_HISTORY_COMMAND } from "lexical";
import { LexicalEditor } from "lexical";
import path from "path";
import React from "react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { getDataPath } from "tests/common";
import { it, afterAll, expect, beforeEach, afterEach } from "vitest";

declare module "vitest" {
  export interface TestContext {
    component: RenderResult;
    queries: BoundFunctions<
      typeof queries & { getAllNotNestedIListItems: typeof getAllByRole.bind }
    >;
    lexicalUpdate: (fn: () => void) => void;
    log: Function;
    editor: NotesLexicalEditor;
    expect: typeof expect;
  }
}

/**
 * Modified version of vitest-preview debug function
 * to save the file in a different location
 */
export function debug() {
  const CACHE_FOLDER = path.join(process.cwd(), "data", ".vitest-preview");
  //content directly copied from vitest-preview to change the cache folder
  function createCacheFolderIfNeeded() {
    if (!fs.existsSync(CACHE_FOLDER)) {
      fs.mkdirSync(CACHE_FOLDER, {
        recursive: true,
      });
    }
  }

  function debug() {
    createCacheFolderIfNeeded();
    fs.writeFileSync(
      path.join(CACHE_FOLDER, "index.html"),
      document.documentElement.outerHTML
    );
  }
  //end of copied code
  debug();
}

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
  return runner(title, context => {
    context.lexicalUpdate(() => {
      const rootNode = $getRoot();
      fn({ context, root: Note.from(rootNode), rootNode });
    });
    debug();
  });
}

testUpdate.only = (title: string, fn) => {
  testUpdate(title, fn, it.only);
};

testUpdate.skip = (title: string, fn) => {
  testUpdate(title, fn, it.skip);
};

//TODO consider changing that function to accept structure parameter like that:
//    const structure = checkStructure(root, {
//  root: {
//    note0,
//    note1: {
//      note2,
//    },
//  },
//});
//in such a case ids would not be available, but these can be compared to text
//or just skipped
export function checkChildren(
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

export function createChildren(
  note: Note,
  count: number
): [Array<Note>, ...Note[]] {
  const start = [...note.children].length;
  for (let i = 0; i < count; ++i) {
    note.createChild(`note${start + i}`);
  }
  const n: Array<Note> = [note, ...note.children];
  const n1: Array<Note> = [...note.children];

  return [n, ...n1];
}

/**
 * loads editor state from a file with the given @name
 * @returns a record of all notes in the editor, with their text in
 * camelCase as keys
 */
export function loadEditorState(editor: LexicalEditor, name: string) {
  type Notes = Record<string, Note>;

  function toCamelCase(str: string): string {
    return str
      .trim()
      .toLowerCase()
      .replace(/(\s+)(\w)/g, (_, __, letter) => letter.toUpperCase());
  }

  function walk(note: Note, notes: Notes) {
    notes[toCamelCase(note.text)] = note;
    for (const child of note.children) {
      walk(child, notes);
    }
  }

  const dataPath = getDataPath(name);
  const serializedEditorState = fs.readFileSync(dataPath).toString();
  const editorState = editor.parseEditorState(serializedEditorState);
  editor.setEditorState(editorState);
  editor.dispatchCommand(CLEAR_HISTORY_COMMAND, null);
  const notes: Notes = {};
  editor.update(() => {
    walk(Note.from($getRoot()), notes);
  });
  return notes;
}

/** put children at the end */
export function lexicalStateKeyCompare(a: any, b: any) {
  if (a === "children") {
    return 1;
  }
  if (b === "children") {
    return -1;
  }
  return a.localeCompare(b);
}

/**
 * converts editor state to YAML with removed defaults for easier reading and
 * comparison, used for saving snapshots
 */
export function getMinimizedState(editor: LexicalEditor) {
  type Node = Array<Node> | object;
  function walk(node: Node) {
    function minimize(node: object) {
      const defaults = {
        list: {
          direction: "ltr",
          format: "",
          indent: 0,
          listType: "bullet",
          start: 1,
          tag: "ul",
          version: 1,
        },
        listitem: {
          direction: "ltr",
          format: "",
          indent: 0,
          version: 1,
          folded: false,
        },
        text: {
          detail: 0,
          format: 0,
          mode: "normal",
          style: "",
          text: "",
          version: 1,
        },
        undefined: {},
        root: {
          direction: "ltr",
          format: "",
          indent: 0,
          version: 1,
        },
      };

      const d = defaults[node["type"]];
      if (!d) {
        throw new Error("No defaults for " + node["type"]);
      }

      for (const key in node) {
        if (node[key] === null || node[key] === d[key]) {
          delete node[key];
        }
      }
    }

    if (
      ["number", "string", "boolean"].includes(typeof node) ||
      node === null
    ) {
      return;
    } else if (node instanceof Array) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i]);
      }
    } else if (node instanceof Object) {
      minimize(node);
      for (const key in node) {
        walk(node[key]);
      }
    } else {
      throw new Error(`Unexpected node: ${node} type: ${typeof node}`);
    }
  }
  const editorState = editor.getEditorState();
  const state = JSON.parse(JSON.stringify(editorState)); // clone deeply
  walk(state);

  return yaml.dump(state, {
    noArrayIndent: true,
    sortKeys: lexicalStateKeyCompare,
  });
}

beforeEach(async context => {
  const LOG_FILE_PATH = path.join(process.cwd(), "data", "test.log");
  fs.writeFileSync(LOG_FILE_PATH, '', 'utf8');

  function testHandler(editor: NotesLexicalEditor) {
    context.editor = editor;
  }

  //lexical/node_modules causes YJS to be loaded twice and leads to issues
  expect(fs.existsSync("lexical/node_modules")).toBeFalsy();

  const routerEntries = ["/"];
  const serializationFile = process.env.VITEST_SERIALIZATION_FILE;
  if (serializationFile) {
    const fileName = path.basename(serializationFile);
    console.log(fileName);
    routerEntries.push(`/?documentID=${fileName}`);
  }

  //TODO test only editor, without router, layout, etc. required editor to abstract from routes
  const component = render(
    <ComponentTestContext.Provider value={{ testHandler }}>
      <MemoryRouter initialEntries={routerEntries}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route element={<Editor />}>
              <Route path="" element="</>" index></Route>
              <Route path="note/:noteID" element="</>"></Route>
            </Route>
            <Route path="about" element={<div>About</div>} />
            <Route path="*" element={<Navigate to="/" />}></Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </ComponentTestContext.Provider>
  );

  const editorElement = component.getByRole("textbox");

  context.component = component;
  context.queries = within(editorElement, {
    ...queries,
    getAllNotNestedIListItems: () =>
      context.queries
        .getAllByRole("listitem")
        .filter(li => !li.classList.contains("li-nested")),
  });

  context.lexicalUpdate = updateFunction => {
    let err = null;
    context.editor.fullUpdate(
      function() {
        try {
          return updateFunction();
        } catch (e) {
          err = e;
        }
      },
      { discrete: true }
    );
    if (err) {
      //rethrow after finishing update
      throw err;
    }
  };

  context.log = function(...args: any[]) {
    const formattedArgs = args.map(arg => {
      if (typeof arg === 'object') {
        return JSON.stringify(arg);
      }
      return String(arg);
    }).join(' ');
    const formattedMessage = `${new Date().toISOString()} - ${formattedArgs}\n`;

    fs.appendFileSync(LOG_FILE_PATH, formattedMessage);
    console.log(formattedMessage);
  }

  if (!process.env.VITE_DISABLECOLLAB) {
    //wait for yjs to connect via websocket and init the editor content
    let i = 0;
    const waitingTime = 10;
    while (editorElement.children.length == 0) {
      if ((i += waitingTime) % 1000 === 0) {
        console.log(`waiting for yjs to load some data - ${i}ms`);
        //console.log(editorElement.outerHTML)
      }
      await new Promise(r => setTimeout(r, waitingTime));
    }
  }
  if (!serializationFile && !process.env.VITE_PERFORMANCE_TESTS) {
    //clear the editor's content before each test
    //except for the serialization, where potentially we may want to save the 
    //current content or performance where some of the tests should be stateful
    //it's important to do it here once collab is already initialized
    context.lexicalUpdate(() => {
      const root = $getRoot();
      root.clear();
    });
  }
});

afterEach(async context => {
  if (!process.env.VITE_DISABLECOLLAB) {
    //an ugly workaround - to give a chance for yjs to sync
    await new Promise(r => setTimeout(r, 10));
  }
  context.component.unmount();
});

afterAll(async () => {
  //an ugly workaround - otherwise we may loose some messages written to console
  await new Promise(r => setTimeout(r, 10));
});
