import { and, desc, eq } from 'drizzle-orm';
import { db, type Transaction } from '$lib/server/db/client';
import { auditLogs } from '$lib/server/db/schema/audit';

export type AuditRow = typeof auditLogs.$inferInsert;

export async function insertAuditRows(tx: Transaction, rows: AuditRow[]) {
	await tx.insert(auditLogs).values(rows);
}

export function findAuditRows(entityType: string, entityId: string, action: string) {
	return db
		.select({ diff: auditLogs.diff, createdAt: auditLogs.createdAt })
		.from(auditLogs)
		.where(
			and(
				eq(auditLogs.entityType, entityType),
				eq(auditLogs.entityId, entityId),
				eq(auditLogs.action, action)
			)
		)
		.orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
		.limit(50);
}
