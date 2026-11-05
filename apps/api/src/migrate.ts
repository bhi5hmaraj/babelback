import { z } from 'zod';
import { connect, runMigrations } from './db.ts';

// Reads DATABASE_URL alone, so migrations run without the storage and admin secrets.
const { db, close } = connect(z.string().startsWith('postgres').parse(process.env.DATABASE_URL));
await runMigrations(db);
await close();
console.log('migrations applied');
