import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';

import { prepareEditorStateForPersistence } from '#client/editor/runtime/editor-state-persistence';
import { normalizeNoteIdOrThrow } from '#domain/notes/ids';
import { withHeadlessCollabSession } from '../../src/headless/collab-session';

const PATH_SEPARATOR_PATTERN = /[\\/]+/g;
const LEADING_DOTS_PATTERN = /^\.+/;

interface CliArguments {
  command?: string;
  filePath?: string;
  docId?: string;
  writeMarkdown: boolean;
}

function parseCliArguments(argv: string[]): CliArguments {
  const result: CliArguments = { writeMarkdown: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;

    if (arg === '--doc' || arg.startsWith('--doc=')) {
      const value = arg === '--doc' ? argv[i + 1] : arg.slice(6);
      if (!value || (arg === '--doc' && value.startsWith('--'))) {
        throw new Error('Missing value for --doc');
      }
      result.docId = value;
      if (arg === '--doc') {
        i += 1;
      }
      continue;
    }

    if (arg === '--md') {
      result.writeMarkdown = true;
      continue;
    }

    if (!result.command) {
      result.command = arg;
    } else if (!result.filePath) {
      result.filePath = arg;
    }
  }

  return result;
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

const { command, filePath, docId: cliDocId, writeMarkdown } = parseCliArguments(process.argv.slice(2));
if (command !== 'save') {
  throw new Error(
    'Usage: snapshot/cli.ts save [filePath] --doc <id> [--md]'
  );
}
if (!cliDocId) {
  throw new Error('snapshot/cli.ts save requires --doc <id>.');
}

const docId = normalizeNoteIdOrThrow(cliDocId, `Invalid document id: ${cliDocId}`);
const targetFile = resolveSnapshotPath(docId, filePath);

try {
  await runSave(docId, targetFile, writeMarkdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function resolveSnapshotPath(
  docId: string,
  filePath: CliArguments['filePath'],
): string {
  const defaultDir = path.resolve('tests/fixtures');

  const ensureJson = (target: string) => (path.extname(target) ? target : `${target}.json`);
  const sanitizeName = (name: string) => name.replaceAll(PATH_SEPARATOR_PATTERN, '_').replace(LEADING_DOTS_PATTERN, '');

  if (!filePath) {
    const base = sanitizeName(docId || 'devDoc');
    return path.join(defaultDir, ensureJson(base));
  }

  const absolutePath = path.resolve(filePath);
  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
    const base = sanitizeName(docId || 'devDoc');
    return path.join(absolutePath, ensureJson(base));
  }

  const withExt = ensureJson(absolutePath);
  return withExt;
}

async function runSave(
  docId: string,
  filePath: string,
  writeMarkdown: boolean,
): Promise<void> {
  await withHeadlessCollabSession(docId, (editor) => {
    const editorState = editor.getEditorState().toJSON();
    const persistedState = prepareEditorStateForPersistence(editorState, docId);
    writeJson(filePath, persistedState);
    console.info(`[snapshot] save -> ${filePath}`);

    if (writeMarkdown) {
      const base = filePath.endsWith('.json') ? filePath.slice(0, -5) : filePath;
      const markdownPath = `${base}.md`;
      const markdown = editor.getEditorState().read(() => $convertToMarkdownString(TRANSFORMERS));
      fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
      fs.writeFileSync(markdownPath, `${markdown}\n`);
      console.info(`[snapshot] markdown -> ${markdownPath}`);
    }
  });
}
