/**
 * These are not real tests, but rather helpers to load/save the editor state
 * to/from file using command line.
 */
//import { fireEvent, within } from "@testing-library/react";
import path from "path";
import { getDataPath } from "../common";
import "./common";
import { getNotes, lexicalStateKeyCompare } from "./common/utils";
import { $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import fs from "fs";
import { it } from "vitest";
import { env } from "../../config/env.server";
import type { RemdoLexicalEditor } from "@/components/Editor/plugins/remdo/ComposerContext";
import type { Note } from "@/components/Editor/plugins/remdo/utils/api";
import { Note as NoteApi } from "@/components/Editor/plugins/remdo/utils/api";
import { $getRoot } from "lexical";

const SERIALIZATION_FILE = env.VITEST_SERIALIZATION_FILE;

type LoadFunction = (name: string) => Record<string, Note>;

function sortObjectKeys<T>(obj: T): T {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sortObjectKeys(item)) as T;
  }

  const sortedObj: Record<string, unknown> = {};
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort(
    lexicalStateKeyCompare,
  );

  for (const key of sortedKeys) {
    sortedObj[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }

  return sortedObj as T;
}

function serializeEditor(editor: RemdoLexicalEditor) {
  const editorState = JSON.parse(JSON.stringify(editor.getEditorState()));
  const sortedJsonObj = sortObjectKeys(editorState);
  const json = JSON.stringify(sortedJsonObj, null, 2);

  let markdown = "";
  editor.update(() => {
    markdown = $convertToMarkdownString(TRANSFORMERS);
  });

  return { json, markdown };
}

function resolveSerializationPath(nameOrPath: string) {
  const trimmed = nameOrPath.trim();
  if (path.isAbsolute(trimmed)) {
    return trimmed.endsWith(".json") ? trimmed : `${trimmed}.json`;
  }
  return getDataPath(trimmed);
}

function saveSerializationFile(editor: RemdoLexicalEditor, nameOrPath: string) {
  const dataPath = resolveSerializationPath(nameOrPath);
  const { json, markdown } = serializeEditor(editor);

  logger.info("Saving to", dataPath);
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, json);

  const mdDataPath = dataPath.replace(/\.json$/, ".md");
  logger.info("Saving to", mdDataPath);
  fs.writeFileSync(mdDataPath, markdown);

  return {
    dataPath,
    mdDataPath,
    json,
    markdown,
  };
}

function loadSerializationFile(load: LoadFunction, nameOrPath: string) {
  const dataPath = resolveSerializationPath(nameOrPath);
  logger.info();
  logger.info();
  logger.info("Loading from", dataPath);
  const notes = load(dataPath);
  logger.info("Loaded");
  logger.preview();
  return { dataPath, notes };
}

it.runIf(SERIALIZATION_FILE)("load", async ({ load }) => {
  loadSerializationFile(load, SERIALIZATION_FILE);
});

it.runIf(SERIALIZATION_FILE)("save", ({ editor, load }) => {
  loadSerializationFile(load, SERIALIZATION_FILE);
  saveSerializationFile(editor, SERIALIZATION_FILE);
});

it.runIf(SERIALIZATION_FILE)("load, verify, save round-trip", async ({
  editor,
  expect,
  load,
  lexicalUpdate,
}) => {
  const initialNotes = getNotes(editor);
  expect(Object.keys(initialNotes)).toEqual(["root"]);

  const { dataPath, notes } = loadSerializationFile(load, SERIALIZATION_FILE);

  lexicalUpdate(() => {
    // Smoke test assumes tree_complex serialization fixture.
    expect(notes.note0?.text).toBe("note0");
    const note1Children = notes.note1 ? [...notes.note1.children] : [];
    expect(note1Children).toHaveLength(3);
    expect(notes.note1200?.parent?.text).toBe("note120");
  });

  const resultsDir = path.join(__dirname, "../data/tests-results");
  const targetPath = path.join(
    resultsDir,
    path.basename(dataPath),
  );

  const originalJson = fs.readFileSync(dataPath, "utf-8");
  const firstSave = saveSerializationFile(editor, targetPath);

  expect(firstSave.json).toBe(originalJson);
  expect(fs.readFileSync(firstSave.dataPath, "utf-8")).toBe(originalJson);

  lexicalUpdate(() => {
    const rootNote = NoteApi.from($getRoot());
    const [firstChild] = [...rootNote.children];
    if (firstChild) {
      firstChild.text = `${firstChild.text} (updated)`;
    }
  });

  const secondSave = saveSerializationFile(editor, targetPath);
  expect(secondSave.json).not.toBe(firstSave.json);
  expect(fs.readFileSync(secondSave.dataPath, "utf-8")).toBe(
    secondSave.json,
  );
});
