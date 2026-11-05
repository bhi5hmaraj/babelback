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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { SingingScore, SongData } from './song.ts';

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

// Keyed by the Clerk user id. Clerk keeps sessions and accounts.
export const users = pgTable(
  'users',
  {
    id: text().primaryKey(),
    creditBalance: integer().notNull().default(0),
    theme: text(),
    accent: text(),
    createdAt: createdAt(),
  },
  (t) => [check('users_credit_balance_non_negative', sql`${t.creditBalance} >= 0`)],
);

export const audioSource = pgEnum('audio_source', ['upload', 'youtube', 'seed']);

export const audioAssets = pgTable('audio_assets', {
  id: uuid().primaryKey().defaultRandom(),
  // Set for uploads; null for YouTube and seed audio, which everyone shares.
  ownerId: text().references(() => users.id, { onDelete: 'cascade' }),
  source: audioSource().notNull(),
  youtubeId: text().unique(),
  title: text().notNull(),
  artist: text(),
  storageKey: text().notNull().unique(),
  contentType: text().notNull(),
  bytes: integer().notNull(),
  durationMs: integer(),
  // Null while an upload or download is still in flight.
  readyAt: timestamp({ withTimezone: true }).defaultNow(),
  createdAt: createdAt(),
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
    signupGrantCredits: integer().notNull().default(40),
    maxSongSeconds: integer().notNull().default(600),
    maxUploadMb: integer().notNull().default(100),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('settings_single_row', sql`${t.id} = 1`),
    check(
      'settings_non_negative',
      sql`least(${t.practiceScoreCredits}, ${t.analysisCredits}, ${t.youtubeImportCredits},
        ${t.signupGrantCredits}, ${t.maxSongSeconds}, ${t.maxUploadMb}) >= 0`,
    ),
  ],
);

// A user reads an asset or its analyses only through their own entry, or when it is a seed.
export const libraryEntries = pgTable(
  'library_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assetId: uuid()
      .notNull()
      .references(() => audioAssets.id, { onDelete: 'cascade' }),
    preferredLanguage: text(),
    createdAt: createdAt(),
    lastOpenedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.assetId)],
);

export const jobType = pgEnum('job_type', ['youtube_ingest', 'analyze', 'practice_score']);
export const jobStatus = pgEnum('job_status', ['queued', 'running', 'succeeded', 'failed']);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: jobType().notNull(),
    status: jobStatus().notNull().default('queued'),
    progress: smallint().notNull().default(0),
    // errorMessage is shown to the user, so it never carries provider detail.
    errorCode: text(),
    errorMessage: text(),
    input: jsonb().$type<Record<string, unknown>>().notNull(),
    youtubeId: text(),
    assetId: uuid().references(() => audioAssets.id, { onDelete: 'set null' }),
    analysisId: uuid().references(() => analyses.id, { onDelete: 'set null' }),
    inngestRunId: text(),
    idempotencyKey: text().unique(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A double click on the same YouTube link starts one job.
    uniqueIndex('jobs_active_youtube')
      .on(t.userId, t.youtubeId)
      .where(sql`${t.status} in ('queued', 'running')`),
  ],
);

export const practiceAttempts = pgTable('practice_attempts', {
  id: uuid().primaryKey().defaultRandom(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  assetId: uuid()
    .notNull()
    .references(() => audioAssets.id, { onDelete: 'cascade' }),
  analysisId: uuid()
    .notNull()
    .references(() => analyses.id, { onDelete: 'cascade' }),
  jobId: uuid().references(() => jobs.id, { onDelete: 'set null' }),
  firstVerse: integer().notNull(),
  lastVerse: integer().notNull(),
  recordingKey: text().notNull(),
  status: jobStatus().notNull().default('queued'),
  score: jsonb().$type<SingingScore>(),
  createdAt: createdAt(),
});

export const ledgerReason = pgEnum('ledger_reason', ['signup_grant', 'purchase', 'spend', 'refund', 'admin']);

// Every balance change writes one row here in the same transaction.
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    delta: integer().notNull(),
    reason: ledgerReason().notNull(),
    jobId: uuid().references(() => jobs.id, { onDelete: 'set null' }),
    paymentEventId: text().unique(),
    createdAt: createdAt(),
  },
  (t) => [
    // A job is charged once and refunded at most once.
    unique().on(t.jobId, t.reason),
    uniqueIndex('credit_ledger_one_signup_grant')
      .on(t.userId)
      .where(sql`${t.reason} = 'signup_grant'`),
  ],
);
