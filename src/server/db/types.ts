import type { Kysely } from 'kysely';
import type { RemdoDatabase } from './schema';

export interface ServerDatabaseClient {
  close: () => Promise<void>;
  db: Kysely<RemdoDatabase>;
}
