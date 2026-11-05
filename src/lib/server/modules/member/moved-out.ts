import { movedOutSchema } from '$lib/life-change/schema';
import { db } from '$lib/server/db/client';
import { ValidationError } from '$lib/server/errors';
import { findAudits, recordAudit } from '$lib/server/modules/audit/service';
import { isAdult, lifeChangeActor, staffOnly } from './life-change-access';
import * as repo from './life-change-repository';
import { subjectOf } from './passed-away';

type Place = repo.Address & { householdId: string };
type Change<T> = { before: T; after: T };
type MoveDiff = Partial<Record<keyof Place, Change<string | null>>>;
type Move = { dest: repo.Address & { householdId?: string }; failure: string; keepOne: boolean };

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

// The checks that matter under concurrency run here, after the lock, against fresh rows.
async function write(subject: repo.Subject, action: string, move: Move) {
	const from = subject.householdId;
	return db.transaction(async (tx) => {
		await repo.lockHousehold(tx, from);
		const staying = await repo.livePeopleIn(from, tx);
		if (move.keepOne && staying <= 1) throw new ValidationError(move.failure);
		const to = {
			...move.dest,
			householdId: move.dest.householdId ?? (await repo.insertHousehold(tx))
		};
		const { householdId, ...address } = to;
		if (!(await repo.moveTo(tx, subject.id, from, householdId, address)))
			throw new ValidationError(move.failure);
		if (staying === 1) await repo.softDeleteHousehold(tx, from);
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
		dest: { addressLine: line, postalCode, cityId },
		failure: 'error_already_alone',
		keepOne: true
	});
	return { householdId };
}

// The move that put the person where they live now; audit order alone could pick a racing one.
export function moveToUndo(subject: Pick<repo.Subject, 'householdId'>, moves: { diff: unknown }[]) {
	const diffs = moves.map((m) => m.diff as MoveDiff);
	return diffs.find((d) => d.householdId?.after === subject.householdId);
}

export async function undoMovedOut(personId: string) {
	const subject = await subjectOf(personId);
	staffOnly(subject);
	const diff = moveToUndo(subject, await findAudits('person', subject.id, 'person.moved_out'));
	const back = diff?.householdId?.before;
	if (!diff || subject.deceasedOn || !back || !(await repo.householdExists(back)))
		throw new ValidationError('error_nothing_to_undo');
	const dest = { ...placeOf(subject), householdId: back } as Place;
	for (const k of ['addressLine', 'postalCode', 'cityId'] as const)
		if (diff[k]) Object.assign(dest, { [k]: diff[k].before });
	await write(subject, 'person.moved_out_undone', {
		dest,
		failure: 'error_nothing_to_undo',
		keepOne: false
	});
}
