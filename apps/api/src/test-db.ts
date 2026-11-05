import postgres from 'postgres';
import { connect, runMigrations } from './db.ts';

// node --test runs each file in its own process, and other checkouts share the
// server, so the pid keeps every database name unique.
export async function freshDatabase(name: string) {
  const unique = `${name}_${process.pid}`;
  const maintenance = postgres(databaseUrl('postgres'), { onnotice: () => {} });
  await maintenance.unsafe(`drop database if exists ${unique} with (force)`);
  await maintenance.unsafe(`create database ${unique}`);

  const database = connect(databaseUrl(unique));
  await runMigrations(database.db);
  return {
    db: database.db,
    close: async () => {
      await database.close();
      await maintenance.unsafe(`drop database if exists ${unique} with (force)`);
      await maintenance.end();
    },
  };
}

function databaseUrl(name: string) {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/${name}`;
  return url.href;
}
