import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import Database from 'better-sqlite3';
import { config } from '#config';
import { normalizeNoteIdOrThrow } from '#domain/notes/ids';

interface BackupDocumentRow {
  id: string;
  kind: 'document' | 'home-document';
  owner_user_id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

interface BackupOptions {
  markdown: boolean;
}

const STAGING_DIR_STALE_MS = 30 * 60 * 1000;
const STAGING_STARTED_AT_FILE = 'started-at';

function parseBackupOptions(argv: string[]): BackupOptions {
  let markdown = false;

  for (const arg of argv) {
    if (arg === '--md') {
      markdown = true;
    } else {
      throw new Error('Usage: snapshot/backup.ts [--md]. Backups always write to DATA_DIR/backup.');
    }
  }

  return { markdown };
}

async function backupSqliteDatabase(sourcePath: string, targetPath: string): Promise<void> {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`SQLite registry not found: ${sourcePath}`);
  }
  if (path.resolve(sourcePath) === path.resolve(targetPath)) {
    throw new Error('Refusing to back up SQLite registry over itself.');
  }

  const liveDb = new Database(sourcePath, { readonly: true });
  try {
    await liveDb.backup(targetPath);
  } finally {
    liveDb.close();
  }
  console.info(`[backup] sqlite -> ${targetPath}`);
}

function readBackupDocuments(sqlitePath: string): BackupDocumentRow[] {
  const backupDb = new Database(sqlitePath, { readonly: true });
  try {
    return backupDb
      .prepare(`
        SELECT
          id,
          document_kind AS kind,
          owner_user_id,
          title,
          created_at,
          updated_at
        FROM documents
        WHERE document_kind IN ('document', 'home-document')
        ORDER BY owner_user_id, document_kind, created_at, id
      `)
      .all() as BackupDocumentRow[];
  } finally {
    backupDb.close();
  }
}

function resolveSnapshotCommand(): { argsPrefix: string[]; command: string } {
  if (fs.existsSync('/app/snapshot.mjs')) {
    return {
      command: process.execPath,
      argsPrefix: ['/app/snapshot.mjs'],
    };
  }

  return {
    command: 'pnpm',
    argsPrefix: ['exec', 'tsx', 'tools/snapshot/cli.ts'],
  };
}

function runSnapshotSave(docId: string, documentsDir: string, markdown: boolean): void {
  const { argsPrefix, command } = resolveSnapshotCommand();
  execFileSync(command, [
    ...argsPrefix,
    'save',
    documentsDir,
    '--doc',
    docId,
    ...(markdown ? ['--md'] : []),
  ], {
    stdio: 'inherit',
  });
}

function writeDocumentIndex(documentsDir: string, documents: BackupDocumentRow[]): void {
  const indexPath = path.join(documentsDir, 'index.json');
  fs.writeFileSync(
    indexPath,
    `${JSON.stringify(documents.map((document) => ({
      createdAt: new Date(document.created_at).toISOString(),
      id: document.id,
      kind: document.kind,
      ownerUserId: document.owner_user_id,
      title: document.title,
      updatedAt: new Date(document.updated_at).toISOString(),
    })), null, 2)}\n`
  );
  console.info(`[backup] index -> ${indexPath}`);
}

function publishStagedBackup(stagingDir: string, backupDir: string): void {
  const documentsDir = path.join(backupDir, 'documents');
  fs.renameSync(path.join(stagingDir, 'remdo.sqlite'), path.join(backupDir, 'remdo.sqlite'));
  fs.rmSync(documentsDir, { force: true, recursive: true });
  fs.renameSync(path.join(stagingDir, 'documents'), documentsDir);
}

function readStagingStartedAt(stagingDir: string): number {
  const startedAtPath = path.join(stagingDir, STAGING_STARTED_AT_FILE);
  const raw = fs.existsSync(startedAtPath)
    ? fs.readFileSync(startedAtPath, 'utf8').trim()
    : '';
  const startedAt = Number.parseInt(raw, 10);
  return Number.isFinite(startedAt) ? startedAt : fs.statSync(stagingDir).mtimeMs;
}

function acquireStagingDir(stagingDir: string): boolean {
  try {
    fs.mkdirSync(stagingDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }

    if (Date.now() - readStagingStartedAt(stagingDir) <= STAGING_DIR_STALE_MS) {
      console.info('[backup] already running; skipping');
      return false;
    }

    throw new Error(
      `Backup staging directory is stale; remove it manually after confirming no backup is running: ${stagingDir}`
    );
  }

  fs.writeFileSync(path.join(stagingDir, STAGING_STARTED_AT_FILE), `${Date.now()}\n`);
  return true;
}

async function main(): Promise<void> {
  const { markdown } = parseBackupOptions(process.argv.slice(2));
  const backupDir = path.resolve(config.env.DATA_DIR, 'backup');
  const sqliteSourcePath = path.join(config.env.DATA_DIR, 'remdo.sqlite');
  const stagingDir = path.join(backupDir, '.next');
  const sqliteBackupPath = path.join(stagingDir, 'remdo.sqlite');
  const documentsDir = path.join(stagingDir, 'documents');

  fs.mkdirSync(backupDir, { recursive: true });
  if (!acquireStagingDir(stagingDir)) {
    return;
  }

  try {
    fs.mkdirSync(documentsDir, { recursive: true });
    await backupSqliteDatabase(sqliteSourcePath, sqliteBackupPath);

    const documents = readBackupDocuments(sqliteBackupPath);
    writeDocumentIndex(documentsDir, documents);

    for (const document of documents) {
      normalizeNoteIdOrThrow(document.id, `Invalid document id in registry: ${document.id}`);
      runSnapshotSave(document.id, documentsDir, markdown);
    }
    publishStagedBackup(stagingDir, backupDir);
  } finally {
    fs.rmSync(stagingDir, { force: true, recursive: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
