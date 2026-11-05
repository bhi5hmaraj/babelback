import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { connect } from './db.ts';
import { env } from './env.ts';
import { importSeeds, seedRecord } from './seeds.ts';
import { connectStorage } from './storage.ts';

const manifest = await readFile(join(import.meta.dirname, '../seeds/seed-songs.json'), 'utf8');
const records = z.array(seedRecord).parse(JSON.parse(manifest));

const { db, close } = connect(env.DATABASE_URL);
await importSeeds(db, connectStorage(env), records);
await close();
console.log(`imported ${records.length} seeds`);
