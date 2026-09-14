import { SqliteAdapter, SqliteDialect } from 'kysely';

class TransactionalSqliteAdapter extends SqliteAdapter {
  // Enable SQLite transactional DDL so schema changes and migration history
  // commit together. Migrations must keep foreign-key enforcement enabled.
  override get supportsTransactionalDdl(): boolean {
    return true;
  }
}

export class ServerSqliteDialect extends SqliteDialect {
  override createAdapter(): SqliteAdapter {
    return new TransactionalSqliteAdapter();
  }
}
