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
const STAGING_PID_FILE = 'pid';
const STAGING_STARTED_AT_FILE = 'started-at';

// TODO: Replace backup console output with bounded events; raw errors and
// resolved paths can disclose dataset metadata in production logs. Probe:
// `rg -n 'console\.(error|info)' tools/snapshot/backup.ts` finds only fixed,
// data-independent messages.

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
  const previousDocumentsDir = path.join(backupDir, 'documents.prev');

  // Swap the new documents into place before touching the published sqlite, and
  // keep the previous documents aside until the sqlite rename commits the new
  // generation. If the process dies between those renames, the next backup run
  // restores `documents.prev` before removing the abandoned staging directory.
  // `stagingDir` is a child of `backupDir`, so every rename stays on one
  // filesystem and is atomic.
  fs.rmSync(previousDocumentsDir, { force: true, recursive: true });
  const hadPreviousDocuments = fs.existsSync(documentsDir);
  if (hadPreviousDocuments) {
    fs.renameSync(documentsDir, previousDocumentsDir);
  }

  try {
    fs.renameSync(path.join(stagingDir, 'documents'), documentsDir);
    fs.renameSync(path.join(stagingDir, 'remdo.sqlite'), path.join(backupDir, 'remdo.sqlite'));
  } catch (error) {
    // Roll back to the previous documents so the published backup stays
    // consistent. A failure here must not shadow the original publish error.
    try {
      fs.rmSync(documentsDir, { force: true, recursive: true });
      if (hadPreviousDocuments) {
        fs.renameSync(previousDocumentsDir, documentsDir);
      }
    } catch (rollbackError) {
      console.error('[backup] rollback after failed publish also failed', rollbackError);
    }
    throw error;
  }

  fs.rmSync(previousDocumentsDir, { force: true, recursive: true });
}

function readStagingPid(stagingDir: string): number | null {
  const pidPath = path.join(stagingDir, STAGING_PID_FILE);
  const raw = fs.existsSync(pidPath) ? fs.readFileSync(pidPath, 'utf8').trim() : '';
  const pid = Number.parseInt(raw, 10);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function readStagingStartedAt(stagingDir: string): number {
  const startedAtPath = path.join(stagingDir, STAGING_STARTED_AT_FILE);
  const raw = fs.existsSync(startedAtPath)
    ? fs.readFileSync(startedAtPath, 'utf8').trim()
    : '';
  const startedAt = Number.parseInt(raw, 10);
  return Number.isFinite(startedAt) ? startedAt : fs.statSync(stagingDir).mtimeMs;
}

function recoverInterruptedPublish(stagingDir: string, backupDir: string): boolean {
  const documentsDir = path.join(backupDir, 'documents');
  const previousDocumentsDir = path.join(backupDir, 'documents.prev');
  if (!fs.existsSync(previousDocumentsDir)) {
    return false;
  }

  if (fs.existsSync(path.join(stagingDir, 'remdo.sqlite'))) {
    fs.rmSync(documentsDir, { force: true, recursive: true });
    fs.renameSync(previousDocumentsDir, documentsDir);
    console.info('[backup] restored previous documents after interrupted publish');
  } else {
    fs.rmSync(previousDocumentsDir, { force: true, recursive: true });
    console.info('[backup] cleaned up completed publish recovery state');
  }

  return true;
}

function writeStagingMetadata(stagingDir: string): void {
  fs.writeFileSync(path.join(stagingDir, STAGING_STARTED_AT_FILE), `${Date.now()}\n`);
  fs.writeFileSync(path.join(stagingDir, STAGING_PID_FILE), `${process.pid}\n`);
}

function acquireStagingDir(stagingDir: string, backupDir: string): boolean {
  try {
    fs.mkdirSync(stagingDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }

    const stagingPid = readStagingPid(stagingDir);
    if (
      (stagingPid !== null && isProcessRunning(stagingPid))
      || (stagingPid === null && Date.now() - readStagingStartedAt(stagingDir) <= STAGING_DIR_STALE_MS)
    ) {
      console.info('[backup] already running; skipping');
      return false;
    }

    if (recoverInterruptedPublish(stagingDir, backupDir)) {
      fs.rmSync(stagingDir, { force: true, recursive: true });
      fs.mkdirSync(stagingDir);
      writeStagingMetadata(stagingDir);
      return true;
    }

    throw new Error(
      `Backup staging directory is stale; remove it manually after confirming no backup is running: ${stagingDir}`
    );
  }

  writeStagingMetadata(stagingDir);
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
  if (!acquireStagingDir(stagingDir, backupDir)) {
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
