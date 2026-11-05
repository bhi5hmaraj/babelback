import { eq, sql } from 'drizzle-orm';
import type { Db } from './db.ts';
import { creditLedger, users } from './schema.ts';
import { getSettings } from './settings.ts';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Entry = Omit<typeof creditLedger.$inferInsert, 'id' | 'createdAt'>;

// The API answers 402 for this.
export class InsufficientCredits extends Error {
  constructor() {
    super('Not enough credits');
  }
}

// Writes the ledger row and moves the balance together. A row the unique indexes
// already hold (a job's spend or refund, the sign-up grant, a payment event) is
// skipped, so a retry never applies twice. Returns false when skipped.
// Call it inside the transaction that creates the job, so a refused charge leaves no job.
export async function applyCredits(tx: Tx, entry: Entry): Promise<boolean> {
  const [row] = await tx.insert(creditLedger).values(entry).onConflictDoNothing().returning({ id: creditLedger.id });
  if (!row) return false;
  try {
    await tx
      .update(users)
      .set({ creditBalance: sql`${users.creditBalance} + ${entry.delta}` })
      .where(eq(users.id, entry.userId));
  } catch (error) {
    if (pgCode(error) === '23514') throw new InsufficientCredits();
    throw error;
  }
  return true;
}

// Creates the users row on the webhook or the first authenticated request,
// whichever comes first, and writes the sign-up grant once.
export async function ensureUser(db: Db, userId: string) {
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(users).values({ id: userId }).onConflictDoNothing().returning();
    if (created) {
      const { signupGrantCredits } = await getSettings(tx);
      await applyCredits(tx, { userId, delta: signupGrantCredits, reason: 'signup_grant' });
    }
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    return user;
  });
}

function pgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}
