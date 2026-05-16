import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../../config';
import { TEST_AUTH_EMAIL_PREFIX } from '../_support/auth-account';

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?')
    .get('table', tableName);
  return Boolean(row);
}

export function cleanupTestAuthData(): void {
  const dbPath = path.join(config.env.DATA_DIR, 'remdo.sqlite');
  if (!fs.existsSync(dbPath)) {
    return;
  }

  const db = new Database(dbPath);
  try {
    if (!tableExists(db, 'user')) {
      return;
    }

    const emailPattern = `${TEST_AUTH_EMAIL_PREFIX}%`;
    db.transaction(() => {
      if (tableExists(db, 'documents')) {
        db.prepare('DELETE FROM documents WHERE owner_user_id IN (SELECT id FROM "user" WHERE email LIKE ?)').run(emailPattern);
      }
      if (tableExists(db, 'session')) {
        db.prepare('DELETE FROM "session" WHERE userId IN (SELECT id FROM "user" WHERE email LIKE ?)').run(emailPattern);
      }
      if (tableExists(db, 'account')) {
        db.prepare('DELETE FROM account WHERE userId IN (SELECT id FROM "user" WHERE email LIKE ?)').run(emailPattern);
      }
      db.prepare('DELETE FROM "user" WHERE email LIKE ?').run(emailPattern);
    })();
  } finally {
    db.close();
  }
}
