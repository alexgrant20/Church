import { db } from '$lib/server/db/client';
import { ValidationError } from '$lib/server/errors';
import { recordAudit } from '$lib/server/modules/audit/service';
import { ADULT_AGE, ageOn, todayIn } from '$lib/server/time';
import type { MemberFilters } from './filters';
import { checkedScope } from './list-service';
import * as repo from './repository';
import { exportScope } from './scope';

export const MAX_EXPORT_ROWS = 10_000;

export type ExportRow = {
	memberCode: string;
	fullName: string;
	nickname: string | null;
	sex: 'male' | 'female';
	birthDate: string;
	household: string | null;
	phone: string | null;
	email: string | null;
	city: string;
	homeBranch: string;
	baptized: boolean;
	sidi: boolean;
};

type Living = Awaited<ReturnType<typeof repo.livingMembersOf>>[number];
const older = (a: Living, b: Living) => (a.birthDate <= b.birthDate ? a : b);

// Households have no name; the oldest adult member's ID stands for one, else the oldest member.
function householdHeads(living: Living[], today: string) {
	const heads = new Map<string, Living>();
	for (const p of living) {
		const best = heads.get(p.householdId);
		const adult = ageOn(p.birthDate, today) >= ADULT_AGE;
		const bestAdult = best && ageOn(best.birthDate, today) >= ADULT_AGE;
		if (!best || (adult && !bestAdult) || (adult === bestAdult && older(p, best) === p)) {
			heads.set(p.householdId, p);
		}
	}
	return heads;
}

async function audit(filters: MemberFilters, rowCount: number) {
	await db.transaction((tx) =>
		recordAudit(tx, {
			action: 'members.exported',
			entityType: 'member_export',
			entityId: crypto.randomUUID(),
			branchId: filters.branchId ?? null,
			diff: { filters: { after: filters }, rowCount: { after: rowCount } }
		})
	);
}

export async function exportMembers(filters: MemberFilters) {
	if (filters.status === 'deceased') throw new ValidationError('error_export_deceased');
	const scope = checkedScope(filters, exportScope());
	const found = await repo.exportMemberRows(filters, scope, MAX_EXPORT_ROWS + 1);
	if (found.length > MAX_EXPORT_ROWS) throw new ValidationError('error_export_too_large');
	const heads = householdHeads(
		await repo.livingMembersOf([...new Set(found.map((r) => r.householdId))]),
		todayIn('Asia/Jakarta')
	);
	const rows: ExportRow[] = found.map(({ householdId, timezone, ...r }) => {
		// Contact details of anyone under 17 never leave the app.
		const minor = ageOn(r.birthDate, todayIn(timezone)) < ADULT_AGE;
		return {
			...r,
			household: heads.get(householdId)?.memberCode ?? null,
			phone: minor ? null : r.phone,
			email: minor ? null : r.email
		};
	});
	await audit(filters, rows.length);
	return { rows, filename: `members-${todayIn('Asia/Jakarta')}.xlsx` };
}
