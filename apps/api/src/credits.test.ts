import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { applyCredits, ensureUser, InsufficientCredits } from './credits.ts';
import { creditLedger, jobs } from './schema.ts';
import { freshDatabase } from './test-db.ts';

let database: Awaited<ReturnType<typeof freshDatabase>>;

before(async () => {
  database = await freshDatabase('babelback_test_credits');
});

after(() => database.close());

test('the sign-up grant is written once however often the user is ensured', async () => {
  await Promise.all([ensureUser(database.db, 'user_a'), ensureUser(database.db, 'user_a')]);
  const user = await ensureUser(database.db, 'user_a');
  assert.equal(user.creditBalance, 40);
  const rows = await database.db.select().from(creditLedger).where(eq(creditLedger.userId, 'user_a'));
  assert.deepEqual(
    rows.map((r) => [r.reason, r.delta]),
    [['signup_grant', 40]],
  );
});

test('a charge the balance cannot cover leaves no job and no ledger row', async () => {
  await ensureUser(database.db, 'user_b');
  await assert.rejects(
    database.db.transaction(async (tx) => {
      const [job] = await tx.insert(jobs).values({ userId: 'user_b', type: 'analyze', input: {} }).returning();
      await applyCredits(tx, { userId: 'user_b', delta: -41, reason: 'spend', jobId: job.id });
    }),
    InsufficientCredits,
  );
  assert.equal((await database.db.select().from(jobs).where(eq(jobs.userId, 'user_b'))).length, 0);
  assert.equal((await ensureUser(database.db, 'user_b')).creditBalance, 40);
});

test('a job is charged once and refunded at most once', async () => {
  await ensureUser(database.db, 'user_c');
  const job = await database.db.transaction(async (tx) => {
    const [job] = await tx.insert(jobs).values({ userId: 'user_c', type: 'analyze', input: {} }).returning();
    await applyCredits(tx, { userId: 'user_c', delta: -5, reason: 'spend', jobId: job.id });
    return job;
  });
  const refund = () =>
    database.db.transaction((tx) => applyCredits(tx, { userId: 'user_c', delta: 5, reason: 'refund', jobId: job.id }));
  assert.equal(await refund(), true);
  assert.equal(await refund(), false);
  assert.equal((await ensureUser(database.db, 'user_c')).creditBalance, 40);
});
