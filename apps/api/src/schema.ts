import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { SongData } from './song.ts';

export const audioSource = pgEnum('audio_source', ['upload', 'youtube', 'seed']);

export const audioAssets = pgTable('audio_assets', {
  id: uuid().primaryKey().defaultRandom(),
  source: audioSource().notNull(),
  title: text().notNull(),
  storageKey: text().notNull().unique(),
  contentType: text().notNull(),
  bytes: integer().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Shared across users: the second person to add a song reads the existing row.
export const analyses = pgTable(
  'analyses',
  {
    id: uuid().primaryKey().defaultRandom(),
    assetId: uuid()
      .notNull()
      .references(() => audioAssets.id, { onDelete: 'cascade' }),
    language: text().notNull(),
    model: text().notNull(),
    karaoke: boolean().notNull(),
    promptVersion: text().notNull(),
    result: jsonb().$type<SongData>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.assetId, t.language, t.model, t.karaoke, t.promptVersion)],
);

// Prices, grants and limits the admin page edits. Exactly one row, inserted by
// the first migration, so the column defaults are the launch values.
export const settings = pgTable(
  'settings',
  {
    id: smallint().primaryKey().default(1),
    practiceScoreCredits: integer().notNull().default(1),
    analysisCredits: integer().notNull().default(5),
    youtubeImportCredits: integer().notNull().default(8),
    trialGrantCredits: integer().notNull().default(8),
    signupGrantCredits: integer().notNull().default(40),
    anonymousUsersPerIpPerDay: integer().notNull().default(3),
    maxSongSeconds: integer().notNull().default(600),
    maxUploadMb: integer().notNull().default(100),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('settings_single_row', sql`${t.id} = 1`),
    check(
      'settings_non_negative',
      sql`least(${t.practiceScoreCredits}, ${t.analysisCredits}, ${t.youtubeImportCredits},
        ${t.trialGrantCredits}, ${t.signupGrantCredits}, ${t.anonymousUsersPerIpPerDay},
        ${t.maxSongSeconds}, ${t.maxUploadMb}) >= 0`,
    ),
  ],
);
