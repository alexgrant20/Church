import type { Transaction } from '$lib/server/db/client';
import { recordAudits } from '$lib/server/modules/audit/service';

type Created = { indexes: number[]; ids: string[]; codes: string[] };
type Moves = { moved: { id: string; before: string }[]; deleted: string[] };
type Person = { fullName: string; nikHash?: string };

// Every row of an approval goes in one insert.
export async function auditApproval(
	tx: Transaction,
	reg: { id: string; branchId: string },
	householdId: string,
	people: Person[],
	created: Created,
	moves: Moves
) {
	const { branchId } = reg;
	await recordAudits(tx, [
		{
			action: 'registration.approved',
			entityType: 'registration',
			entityId: reg.id,
			branchId,
			diff: {
				status: { before: 'pending', after: 'approved' },
				householdId: { after: householdId }
			}
		},
		...created.indexes.map((i, n) => ({
			action: 'person.created',
			entityType: 'person',
			entityId: created.ids[n],
			branchId,
			diff: {
				fullName: { after: people[i].fullName },
				memberCode: { after: created.codes[n] },
				householdId: { after: householdId },
				...(people[i].nikHash ? { nik: { changed: true } } : {})
			}
		})),
		...moves.moved.map((m) => ({
			action: 'person.household_changed',
			entityType: 'person',
			entityId: m.id,
			branchId,
			diff: { householdId: { before: m.before, after: householdId } }
		})),
		...moves.deleted.map((id) => ({
			action: 'household.deleted',
			entityType: 'household',
			entityId: id,
			branchId,
			diff: { deletedAt: { before: null, after: new Date().toISOString() } }
		}))
	]);
}
