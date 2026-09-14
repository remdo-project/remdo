import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { baselineStatements } from './001-baseline-schema';

// Compare complete DDL, including constraints and indexes, rather than treating
// a matching column list as proof that an existing database has this baseline.
// Quoted string values remain case-sensitive; identifier quoting and layout do not.
function normalizedDdl(statement: string): string {
  const tokens = statement.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|\w+|\S/gu) ?? [];
  return tokens.map((token) => token.startsWith("'")
    ? token
    : token.replace(/^"(\w+)"$/u, '$1').toLowerCase()).join(' ');
}

// Historical migrations deliberately do not depend on current database types.
export async function up(db: Kysely<any>): Promise<void> {
  const { rows } = await sql<{ name: string; sql: string | null }>`
    SELECT name, sql FROM sqlite_master
    WHERE name NOT GLOB 'sqlite_*'
      AND name NOT IN ('kysely_migration', 'kysely_migration_lock')
  `.execute(db);
  if (rows.length === 0) {
    for (const statement of baselineStatements) {
      await sql.raw(statement).execute(db);
    }
    return;
  }

  const expected = new Set(baselineStatements.map(normalizedDdl));
  for (const row of rows) {
    let statement = normalizedDdl(row.sql ?? '');
    // The previous release also accepted this unused predecessor column. Keep
    // its values intact; removing it belongs to a later explicit migration.
    if (row.name === 'source_servers') {
      statement = statement.replace(' , client_secret text', '');
    }
    // The pre-issuer upgrade appended issuer before rebuilding the table.
    if (row.name === 'account' && statement.endsWith(', issuer text not null )')) {
      statement = statement.replace(', issuer text not null )', ')')
        .replace('( id text not null primary key ,', '( id text not null primary key , issuer text not null ,');
    }
    if (!expected.delete(statement)) {
      throw new Error(`Unsupported unversioned database schema: ${row.name}. Restore a supported database before retrying; existing data was not adopted.`);
    }
  }
  if (expected.size > 0) {
    throw new Error('Unsupported incomplete unversioned database schema. Existing data was not adopted.');
  }
}
