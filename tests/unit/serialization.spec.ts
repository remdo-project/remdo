/**
 * These are not real tests, but rather helpers to load/save the editor state
 * to/from file using command line.
 */
//import { fireEvent, within } from "@testing-library/react";
import { getDataPath } from "../common";
import "./common";
import { lexicalStateKeyCompare } from "./common";
import { $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import fs from "fs";
import { it } from "vitest";
import { env } from "../../config/env.server";
import path from "path";
import type { RemdoLexicalEditor } from "@/components/Editor/plugins/remdo/ComposerContext";

function sortObjectKeys(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sortedObj: Record<string, unknown> = {};
  const sortedKeys = Object.keys(obj).sort(lexicalStateKeyCompare);

  for (const key of sortedKeys) {
    sortedObj[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }

  return sortedObj;
}

function ensureDirectoryExists(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function stripRemdoMetadata(node: unknown): unknown {
  if (typeof node !== "object" || node === null) {
    return node;
  }

  if (Array.isArray(node)) {
    node.forEach(stripRemdoMetadata);
    return node;
  }

  const record = node as Record<string, unknown>;
  if (record.$ && typeof record.$ === "object" && record.$ !== null) {
    const remdoState = record.$ as Record<string, unknown>;
    delete remdoState["remdo:id"];
    delete remdoState["remdo:folded"];
    delete remdoState["remdo:checked"];
    if (Object.keys(remdoState).length === 0) {
      delete record.$;
    }
  }

  for (const key of Object.keys(record)) {
    stripRemdoMetadata(record[key]);
  }

  return record;
}

function createSortedEditorStateSnapshot(editor: RemdoLexicalEditor) {
  const editorState = JSON.parse(JSON.stringify(editor.getEditorState()));
  stripRemdoMetadata(editorState);
  return JSON.stringify(sortObjectKeys(editorState), null, 2);
}

function createMarkdownSnapshot(editor: RemdoLexicalEditor) {
  let markdown = "";
  editor.update(() => {
    markdown = $convertToMarkdownString(TRANSFORMERS);
  });
  return markdown;
}

function saveSerializationArtifacts(editor: RemdoLexicalEditor, dataPath: string) {
  ensureDirectoryExists(dataPath);
  const sortedJson = createSortedEditorStateSnapshot(editor);
  logger.info("Saving to", dataPath);
  fs.writeFileSync(dataPath, sortedJson);

  const mdDataPath = dataPath.replace(/\.json$/, ".md");
  const markdown = createMarkdownSnapshot(editor);
  logger.info("Saving to", mdDataPath);
  fs.writeFileSync(mdDataPath, markdown);

  return { jsonPath: dataPath, markdownPath: mdDataPath };
}

const SERIALIZATION_FILE = env.VITEST_SERIALIZATION_FILE;

it.runIf(SERIALIZATION_FILE)("load", async ({ load }) => {
  const dataPath = getDataPath(SERIALIZATION_FILE);
  logger.info();
  logger.info();
  logger.info("Loading from", dataPath);
  load(dataPath);
  logger.info("Loaded");
  logger.preview();
});

it.runIf(SERIALIZATION_FILE)("save", ({ editor, load }) => {
  load(SERIALIZATION_FILE);
  const dataPath = getDataPath(SERIALIZATION_FILE);
  saveSerializationArtifacts(editor, dataPath);
});

it.runIf(SERIALIZATION_FILE)("load/save smoke", async ({
  editor,
  expect,
  lexicalUpdate,
  load,
}) => {
  await expect(editor).toMatchNoteTree([]);

  const notes = load(SERIALIZATION_FILE);
  // The smoke test assumes the tree_complex fixture.
  lexicalUpdate(() => {
    expect(notes.note0.text).toBe("note0");
    expect([...notes.note0.children].map((child) => child.text)).toEqual(
      expect.arrayContaining(["note00", "note01"]),
    );
    expect(notes.note000.parent.text).toBe("note00");
  });

  const sourcePath = getDataPath(SERIALIZATION_FILE);
  const resultsDir = path.join(__dirname, "..", "..", "data", "tests-results");
  const targetPath = path.join(resultsDir, path.basename(sourcePath));

  const cleanupPaths: string[] = [];
  try {
    const { jsonPath, markdownPath } = saveSerializationArtifacts(
      editor,
      targetPath,
    );
    cleanupPaths.push(jsonPath, markdownPath);

    const savedJson = fs.readFileSync(jsonPath, "utf-8");
    const sourceJson = fs.readFileSync(sourcePath, "utf-8");
    expect(savedJson).toBe(sourceJson);

    lexicalUpdate(() => {
      notes.note1.text = "note1 (modified)";
    });

    saveSerializationArtifacts(editor, targetPath);

    const modifiedJson = fs.readFileSync(jsonPath, "utf-8");
    expect(modifiedJson).not.toBe(sourceJson);
  } finally {
    for (const filePath of cleanupPaths) {
      fs.rmSync(filePath, { force: true });
    }
  }
});
