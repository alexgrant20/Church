import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db, type Transaction } from '$lib/server/db/client';
import {
	accounts,
	people,
	registrationConsents,
	registrations,
	registrationThrottles
} from '$lib/server/db/schema';

// Dates are passed from JS as ISO strings so the window logic stays testable.
const at = (d: Date) => sql`${d.toISOString()}::timestamptz`;

// One atomic upsert per key: concurrent submissions cannot slip past the limit.
export async function hitThrottle(keyHash: string, now: Date, windowMs: number): Promise<number> {
	const expired = sql`${registrationThrottles.windowStartedAt} < ${at(new Date(now.getTime() - windowMs))}`;
	const [row] = await db
		.insert(registrationThrottles)
		.values({ keyHash, count: 1, windowStartedAt: now })
		.onConflictDoUpdate({
			target: registrationThrottles.keyHash,
			set: {
				count: sql`case when ${expired} then 1 else least(${registrationThrottles.count} + 1, 1000) end`,
				windowStartedAt: sql`case when ${expired} then ${at(now)} else ${registrationThrottles.windowStartedAt} end`
			}
		})
		.returning({ count: registrationThrottles.count });
	return row.count;
}

export async function insertRegistration(
	tx: Transaction,
	row: typeof registrations.$inferInsert
): Promise<string> {
	const [{ id }] = await tx.insert(registrations).values(row).returning({ id: registrations.id });
	return id;
}

export async function insertConsents(
	tx: Transaction,
	rows: (typeof registrationConsents.$inferInsert)[]
) {
	if (rows.length) await tx.insert(registrationConsents).values(rows);
}

type Keys = { nikHashes: string[]; emails: string[]; phones: string[] };

// One query for every submitted person; the caller groups the rows in memory.
export async function findMatchingMembers({ nikHashes, emails, phones }: Keys) {
	const any: SQL[] = [];
	if (nikHashes.length) any.push(inArray(people.nikHash, nikHashes));
	if (emails.length) any.push(inArray(sql`lower(${accounts.email})`, emails));
	if (phones.length) any.push(inArray(accounts.phone, phones));
	if (!any.length) return [];
	return db
		.select({
			id: people.id,
			nikHash: people.nikHash,
			locale: people.preferredLocale,
			email: accounts.email,
			phone: accounts.phone,
			activatedAt: accounts.activatedAt
		})
		.from(people)
		.leftJoin(accounts, eq(accounts.personId, people.id))
		.where(and(isNull(people.deletedAt), eq(people.isMember, true), or(...any)));
}
