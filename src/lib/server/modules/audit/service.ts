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
	actorPersonId?: string | null;
};

const toRow = (input: RecordAuditInput, ctx: ReturnType<typeof safeGetContext>) => ({
	actorPersonId: input.actorPersonId ?? ctx?.personId ?? null,
	onBehalfOfPersonId: ctx?.actingAsPersonId ?? null,
	action: input.action,
	entityType: input.entityType,
	entityId: input.entityId,
	branchId: input.branchId,
	diff: input.diff ?? null,
	metadata: { ip: ctx?.ip ?? null, ...((input.metadata as object) ?? {}) }
});

export const recordAudit = (tx: Transaction, input: RecordAuditInput) => recordAudits(tx, [input]);

// One insert for a whole batch, so a bulk mutation never audits row by row.
export async function recordAudits(tx: Transaction, inputs: RecordAuditInput[]) {
	if (!inputs.length) return;
	const ctx = safeGetContext();
	await tx.insert(auditLogs).values(inputs.map((i) => toRow(i, ctx)));
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
