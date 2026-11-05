import postgres from 'postgres';
import { connect, runMigrations } from './db.ts';

// Each test file passes its own name, because node --test runs files in parallel.
export async function freshDatabase(name: string) {
  const maintenance = postgres(databaseUrl('postgres'), { onnotice: () => {} });
  await maintenance.unsafe(`drop database if exists ${name} with (force)`);
  await maintenance.unsafe(`create database ${name}`);
  await maintenance.end();

  const database = connect(databaseUrl(name));
  await runMigrations(database.db);
  return database;
}

function databaseUrl(name: string) {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/${name}`;
  return url.href;
}
