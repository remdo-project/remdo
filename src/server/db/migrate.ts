import { Migrator } from 'kysely/migration';
import type { Kysely } from 'kysely';
import { up as baselineUp } from './migrations/001-baseline';
import type { RemdoDatabase } from './schema';

export async function migrateServerDatabase(db: Kysely<RemdoDatabase>): Promise<void> {
  // Explicit imports also work in the production CJS bundle; no source-directory
  // discovery or dependency-generated schema changes happen at runtime.
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => ({ '001-baseline': { up: baselineUp } }) },
  });
  const { error } = await migrator.migrateToLatest();
  if (error) {
    throw error;
  }
}
