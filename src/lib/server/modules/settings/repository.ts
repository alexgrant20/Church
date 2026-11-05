import { eq } from 'drizzle-orm';
import { db, type Transaction } from '$lib/server/db/client';
import { systemSettings } from '$lib/server/db/schema';

// Inside a save it locks the row; plain reads (every member record) take no lock.
export async function findSetting(key: string, tx?: Transaction) {
	const query = (tx ?? db)
		.select({ id: systemSettings.id, value: systemSettings.value })
		.from(systemSettings)
		.where(eq(systemSettings.key, key));
	const [row] = await (tx ? query.for('update') : query);
	return row;
}

export async function upsertSetting(
	tx: Transaction,
	key: string,
	value: unknown,
	personId: string | null
) {
	const [row] = await tx
		.insert(systemSettings)
		.values({ key, value, updatedByPersonId: personId })
		.onConflictDoUpdate({
			target: systemSettings.key,
			set: { value, updatedByPersonId: personId, updatedAt: new Date() }
		})
		.returning({ id: systemSettings.id });
	return row;
}
