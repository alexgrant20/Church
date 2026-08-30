import { auditLogs } from '$lib/server/db/schema/audit';
import type { Transaction } from '$lib/server/db/client';
import { getContext } from '$lib/server/context';

type RecordAuditInput = {
	action: string;
	entityType: string;
	entityId: string;
	branchId: string | null;
	diff?: unknown;
	metadata?: unknown;
	actorUserId?: string | null;
};

export async function recordAudit(tx: Transaction, input: RecordAuditInput) {
	const ctx = safeGetContext();
	await tx.insert(auditLogs).values({
		actorUserId: input.actorUserId ?? ctx?.userId ?? null,
		action: input.action,
		entityType: input.entityType,
		entityId: input.entityId,
		branchId: input.branchId,
		diff: input.diff ?? null,
		metadata: { ip: ctx?.ip ?? null, ...((input.metadata as object) ?? {}) }
	});
}

export async function withAudit<T>(
	tx: Transaction,
	action: string,
	entityType: string,
	fn: () => Promise<{ entityId: string; branchId: string | null; diff?: unknown; result: T }>
): Promise<T> {
	const { entityId, branchId, diff, result } = await fn();
	await recordAudit(tx, { action, entityType, entityId, branchId, diff });
	return result;
}

function safeGetContext() {
	try {
		return getContext();
	} catch {
		return null;
	}
}
