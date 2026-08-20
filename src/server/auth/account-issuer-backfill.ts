import { createLocalAccountIssuer, createOAuthAccountIssuer } from '@better-auth/core/db';
import type Database from 'better-sqlite3';
import { readTableColumns, tableExists } from '#server/db/client';

/**
 * The issuer an account created before the column would carry today. A source
 * server advertises its own origin; credentials are a local authentication
 * method, and anything else is an OAuth identity in its own namespace.
 */
function resolveExistingAccountIssuer(
  providerId: string,
  sourceServerOrigins: ReadonlyMap<string, string>
): string {
  const sourceServerOrigin = sourceServerOrigins.get(providerId);
  if (sourceServerOrigin !== undefined) {
    return sourceServerOrigin;
  }
  return providerId === 'credential'
    ? createLocalAccountIssuer(providerId)
    : createOAuthAccountIssuer(providerId);
}

/**
 * Replaces the nullable `issuer` column with the required one Better Auth
 * declares, so a migrated database ends up with the schema a fresh one has.
 * SQLite cannot tighten a column in place, so the table is rebuilt; the caller
 * runs this inside a transaction, having proved every row has an issuer.
 */
function rebuildAccountTableWithRequiredIssuer(sqlite: Database.Database): void {
  const createTableSql = (
    sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'account'")
      .get() as { sql: string }
  ).sql;
  const requiredIssuerSql = createTableSql.replace(
    /"?issuer"?\s+TEXT(?!\s+NOT NULL)/iu,
    '"issuer" text not null'
  );
  const columns = readTableColumns(sqlite, 'account')
    .map((column) => `"${column}"`)
    .join(', ');

  sqlite.exec('PRAGMA foreign_keys = OFF');
  try {
    sqlite.exec(requiredIssuerSql.replace(/"account"|\baccount\b/u, '"account_migrated"'));
    sqlite.exec(`INSERT INTO "account_migrated" (${columns}) SELECT ${columns} FROM "account"`);
    sqlite.exec('DROP TABLE "account"');
    sqlite.exec('ALTER TABLE "account_migrated" RENAME TO "account"');
  } finally {
    sqlite.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * Better Auth 1.7 keys accounts on `(issuer, accountId)`. Its migrator refuses
 * to add the required `issuer` column to a populated table, because it has no
 * value to give existing rows, and directs the caller to add the column,
 * backfill it, then enforce the constraint:
 * https://better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-is-scoped-by-issuer
 *
 * Add the column and derive each row's issuer exactly as this server derives it
 * for new accounts, then let Better Auth's migrator own everything else. An
 * issuer that disagrees with the one its provider advertises would orphan the
 * account: linking matches on `(issuer, accountId)`.
 *
 * The column is added nullable, backfilled, checked for the duplicates its new
 * unique index would reject, and only then tightened, so a half-finished
 * migration cannot leave a row without a real issuer.
 */
export function backfillAccountIssuers(
  sqlite: Database.Database,
  sourceServers: readonly { baseUrl: string; id: string }[]
): void {
  if (!tableExists(sqlite, 'account')) {
    return;
  }
  if (readTableColumns(sqlite, 'account').includes('issuer')) {
    return;
  }

  const providerIds = sqlite
    .prepare('SELECT DISTINCT providerId FROM account')
    .all() as { providerId: string }[];

  const sourceServerOrigins = new Map(sourceServers.map((server) => [server.id, server.baseUrl]));

  sqlite.transaction(() => {
    sqlite.exec('ALTER TABLE account ADD COLUMN issuer TEXT');
    const assignIssuer = sqlite.prepare('UPDATE account SET issuer = ? WHERE providerId = ?');
    for (const { providerId } of providerIds) {
      assignIssuer.run(resolveExistingAccountIssuer(providerId, sourceServerOrigins), providerId);
    }

    const unresolved = sqlite
      .prepare("SELECT COUNT(*) AS count FROM account WHERE issuer IS NULL OR issuer = ''")
      .get() as { count: number };
    if (unresolved.count > 0) {
      throw new Error(`Cannot migrate ${unresolved.count} account row(s) without an issuer.`);
    }

    // Better Auth adds a unique (issuer, accountId) index next. Duplicates that
    // only appear once accounts are scoped by issuer need a human decision about
    // which row survives, so stop here rather than fail inside its migrator.
    const collisions = sqlite
      .prepare(`
        SELECT issuer, accountId FROM account
        GROUP BY issuer, accountId HAVING COUNT(*) > 1
      `)
      .all() as { accountId: string; issuer: string }[];
    if (collisions.length > 0) {
      const described = collisions
        .map((collision) => `${collision.issuer}/${collision.accountId}`)
        .join(', ');
      throw new Error(`Cannot migrate accounts sharing an identity: ${described}.`);
    }

    rebuildAccountTableWithRequiredIssuer(sqlite);
  })();
}
