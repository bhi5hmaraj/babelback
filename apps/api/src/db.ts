import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema.ts';

export function connect(url: string) {
  const client = postgres(url, { onnotice: () => {} });
  return {
    db: drizzle({ client, schema, casing: 'snake_case' }),
    close: () => client.end(),
  };
}

export type Db = ReturnType<typeof connect>['db'];

export function runMigrations(db: Db) {
  return migrate(db, { migrationsFolder: join(import.meta.dirname, '../drizzle') });
}
