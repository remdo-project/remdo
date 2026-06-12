/* eslint-disable node/no-process-env */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const STALE_STAGING_STARTED_AT = Date.now() - (31 * 60 * 1000);

function createTempDataDir(): string {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-snapshot-backup-'));
  execFileSync(process.execPath, [
    '-e',
    [
      'const Database = require("better-sqlite3");',
      'const db = new Database(process.argv[1]);',
      'db.exec("CREATE TABLE documents (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, document_kind TEXT NOT NULL, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE document_access (document_id TEXT NOT NULL, grantee_user_id TEXT NOT NULL, PRIMARY KEY(document_id, grantee_user_id));");',
      'db.close();',
    ].join(' '),
    path.join(dataDir, 'remdo.sqlite'),
  ]);
  return dataDir;
}

function insertDocument(dataDir: string, id: string): void {
  execFileSync(process.execPath, [
    '-e',
    [
      'const Database = require("better-sqlite3");',
      'const db = new Database(process.argv[1]);',
      'db.prepare("INSERT INTO documents (id, owner_user_id, document_kind, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(process.argv[2], "owner", "document", "Test", 1, 1);',
      'db.close();',
    ].join(' '),
    path.join(dataDir, 'remdo.sqlite'),
    id,
  ]);
}

function runBackup(dataDir: string, args: string[] = []): ReturnType<typeof spawnSync> {
  return spawnSync(
    './tools/env.sh',
    ['pnpm', 'exec', 'tsx', 'tools/snapshot/backup.ts', ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        NODE_ENV: 'test',
      },
    }
  );
}

describe('snapshot backup CLI', () => {
  let tempDirs: string[] = [];

  beforeEach(() => {
    tempDirs = [];
  });

  afterEach(() => {
    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('writes to DATA_DIR/backup without accepting a destination argument', () => {
    const dataDir = createTempDataDir();
    tempDirs.push(dataDir);
    const backupDir = path.join(dataDir, 'backup');
    const documentsDir = path.join(dataDir, 'backup', 'documents');
    fs.mkdirSync(documentsDir, { recursive: true });
    fs.mkdirSync(path.join(backupDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(backupDir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(backupDir, 'local-note.txt'), 'keep\n');
    fs.writeFileSync(path.join(documentsDir, 'stale-doc.json'), '{}\n');
    fs.writeFileSync(path.join(documentsDir, 'stale-doc.md'), '# stale\n');

    const result = runBackup(dataDir, ['--md']);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(dataDir, 'backup', 'remdo.sqlite'))).toBe(true);
    expect(fs.existsSync(path.join(documentsDir, 'index.json'))).toBe(true);
    expect(fs.existsSync(path.join(documentsDir, 'stale-doc.json'))).toBe(false);
    expect(fs.existsSync(path.join(documentsDir, 'stale-doc.md'))).toBe(false);
    expect(fs.readFileSync(path.join(backupDir, '.git', 'HEAD'), 'utf8')).toBe('ref: refs/heads/main\n');
    expect(fs.readFileSync(path.join(backupDir, 'local-note.txt'), 'utf8')).toBe('keep\n');
    expect(fs.existsSync(path.join(backupDir, '.next'))).toBe(false);
  });

  it('keeps the previous backup when a staged document export fails', () => {
    const dataDir = createTempDataDir();
    tempDirs.push(dataDir);
    insertDocument(dataDir, 'bad/doc');
    const backupDir = path.join(dataDir, 'backup');
    const documentsDir = path.join(backupDir, 'documents');
    fs.mkdirSync(documentsDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, 'remdo.sqlite'), 'previous sqlite\n');
    fs.writeFileSync(path.join(documentsDir, 'index.json'), 'previous index\n');
    fs.writeFileSync(path.join(documentsDir, 'previous.md'), 'previous markdown\n');

    const result = runBackup(dataDir, ['--md']);

    expect(result.status).toBe(1);
    expect(fs.readFileSync(path.join(backupDir, 'remdo.sqlite'), 'utf8')).toBe('previous sqlite\n');
    expect(fs.readFileSync(path.join(documentsDir, 'index.json'), 'utf8')).toBe('previous index\n');
    expect(fs.readFileSync(path.join(documentsDir, 'previous.md'), 'utf8')).toBe('previous markdown\n');
    expect(fs.existsSync(path.join(backupDir, '.next'))).toBe(false);
  });

  it('skips when another backup is already staging output', () => {
    const dataDir = createTempDataDir();
    tempDirs.push(dataDir);
    const backupDir = path.join(dataDir, 'backup');
    const stagingDir = path.join(backupDir, '.next');
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'started-at'), `${Date.now()}\n`);

    const result = runBackup(dataDir, ['--md']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('already running; skipping');
    expect(fs.existsSync(stagingDir)).toBe(true);
    expect(fs.existsSync(path.join(backupDir, 'remdo.sqlite'))).toBe(false);
  });

  it('fails without deleting stale staged output', () => {
    const dataDir = createTempDataDir();
    tempDirs.push(dataDir);
    const backupDir = path.join(dataDir, 'backup');
    const stagingDir = path.join(backupDir, '.next');
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'started-at'), `${STALE_STAGING_STARTED_AT}\n`);
    fs.writeFileSync(path.join(stagingDir, 'stale.tmp'), 'stale\n');

    const result = runBackup(dataDir, ['--md']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Backup staging directory is stale');
    expect(result.stderr).toContain(stagingDir);
    expect(fs.readFileSync(path.join(stagingDir, 'stale.tmp'), 'utf8')).toBe('stale\n');
    expect(fs.existsSync(path.join(backupDir, 'remdo.sqlite'))).toBe(false);
  });

  it('rejects positional backup destinations', () => {
    const dataDir = createTempDataDir();
    tempDirs.push(dataDir);

    const result = runBackup(dataDir, [dataDir]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Backups always write to DATA_DIR/backup.');
    expect(fs.existsSync(path.join(dataDir, 'backup', 'remdo.sqlite'))).toBe(false);
  });
});
