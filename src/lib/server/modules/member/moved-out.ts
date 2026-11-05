import { movedOutSchema } from '$lib/life-change/schema';
import { db } from '$lib/server/db/client';
import { ValidationError } from '$lib/server/errors';
import { findLatestAudit, recordAudit } from '$lib/server/modules/audit/service';
import { isAdult, lifeChangeActor, staffOnly } from './life-change-access';
import * as repo from './life-change-repository';
import { subjectOf } from './passed-away';

type Place = repo.Address & { householdId: string };
type Change<T> = { before: T; after: T };
type MoveDiff = Partial<Record<keyof Place, Change<string | null>>>;

const placeOf = (s: repo.Subject): Place => ({
	householdId: s.householdId,
	addressLine: s.addressLine,
	postalCode: s.postalCode,
	cityId: s.cityId
});

// Only the fields that changed, per the audit rule.
function diffOf(before: Place, after: Place): MoveDiff {
	const keys = Object.keys(after) as (keyof Place)[];
	return Object.fromEntries(
		keys
			.filter((k) => before[k] !== after[k])
			.map((k) => [k, { before: before[k], after: after[k] }])
	);
}

// A move without a household id gets a new household, created in the same transaction.
async function write(
	subject: repo.Subject,
	action: string,
	dest: repo.Address & { householdId?: string },
	leaving?: string
) {
	return db.transaction(async (tx) => {
		const to = { ...dest, householdId: dest.householdId ?? (await repo.insertHousehold(tx)) };
		const { householdId, ...address } = to;
		await repo.moveTo(tx, subject.id, householdId, address);
		if (leaving && (await repo.livePeopleIn(leaving, tx)) === 0)
			await repo.softDeleteHousehold(tx, leaving);
		await recordAudit(tx, {
			action,
			entityType: 'person',
			entityId: subject.id,
			branchId: subject.homeBranchId,
			diff: diffOf(placeOf(subject), to)
		});
		return householdId;
	});
}

export async function recordMovedOut(personId: string, input: unknown) {
	const subject = await subjectOf(personId);
	await lifeChangeActor(subject);
	if (subject.deceasedOn) throw new ValidationError('error_already_deceased');
	if (!isAdult(subject)) throw new ValidationError('error_not_adult');
	if ((await repo.livePeopleIn(subject.householdId)) <= 1)
		throw new ValidationError('error_already_alone');
	const parsed = movedOutSchema.safeParse(input);
	if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
	const { line, postalCode, cityId } = parsed.data.address;
	const householdId = await write(subject, 'person.moved_out', {
		addressLine: line,
		postalCode,
		cityId
	});
	return { householdId };
}

// Allowed only while the person still lives where their latest move put them.
export const canMoveBack = (
	subject: Pick<repo.Subject, 'householdId'>,
	latest?: { diff: unknown }
) => (latest?.diff as MoveDiff | undefined)?.householdId?.after === subject.householdId;

export async function undoMovedOut(personId: string) {
	const subject = await subjectOf(personId);
	staffOnly(subject);
	const latest = await findLatestAudit('person.moved_out', subject.id);
	const diff = latest?.diff as MoveDiff | undefined;
	const back = diff?.householdId?.before;
	if (
		!canMoveBack(subject, latest) ||
		subject.deceasedOn ||
		!back ||
		!(await repo.householdExists(back))
	)
		throw new ValidationError('error_nothing_to_undo');
	const now = placeOf(subject);
	const to = { ...now, householdId: back } as Place;
	for (const k of ['addressLine', 'postalCode', 'cityId'] as const)
		if (diff[k]) Object.assign(to, { [k]: diff[k].before });
	await write(subject, 'person.moved_out_undone', to, subject.householdId);
}
