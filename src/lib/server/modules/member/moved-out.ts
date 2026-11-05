import { movedOutSchema } from '$lib/life-change/schema';
import { db, type Transaction } from '$lib/server/db/client';
import { ValidationError } from '$lib/server/errors';
import { findAudits, recordAudit, recordAudits } from '$lib/server/modules/audit/service';
import { childrenWhoGo } from './children-who-go';
import { actedAs, isAdult, lifeChangeActor, staffOnly } from './life-change-access';
import * as repo from './life-change-repository';
import { moveAll } from './marriage-repository';
import { subjectOf } from './passed-away';

export type Place = repo.Address & { householdId: string };
type Change<T> = { before: T; after: T };
type MoveDiff = Partial<Record<keyof Place, Change<string | null>>>;
type Move = { dest: repo.Address & { householdId?: string }; failure: string; keepOne: boolean };

export const placeOf = (s: repo.Subject): Place => ({
	householdId: s.householdId,
	addressLine: s.addressLine,
	postalCode: s.postalCode,
	cityId: s.cityId
});

// Only the fields that changed, per the audit rule.
export function diffOf(before: Place, after: Place): MoveDiff {
	const keys = Object.keys(after) as (keyof Place)[];
	return Object.fromEntries(
		keys
			.filter((k) => before[k] !== after[k])
			.map((k) => [k, { before: before[k], after: after[k] }])
	);
}

// The last adults out take their children under 17 along. Call it after the household lock and
// before the leavers move, so it reads who lives there now.
export async function moveChildrenAlong(tx: Transaction, leavers: repo.Subject[], to: Place) {
	const homes = [...new Set(leavers.map((l) => l.householdId))];
	const residents = (await repo.livingIn(tx, homes)).map((r) => ({ ...r, adult: isAdult(r) }));
	const ids = leavers.map((l) => l.id);
	const going = childrenWhoGo(residents, ids, await repo.familyLinks(ids, tx));
	if (!going.length) return;
	const { householdId, ...address } = to;
	const moves = going.map(({ child }) => ({ id: child.id, from: child.householdId }));
	if ((await moveAll(tx, moves, householdId, address)) !== moves.length)
		throw new ValidationError('error_changed_meanwhile');
	await recordAudits(
		tx,
		going.map(({ child, parentId }) => ({
			action: 'person.moved_with_parent',
			entityType: 'person',
			entityId: child.id,
			branchId: child.homeBranchId,
			diff: diffOf(placeOf(child), to),
			metadata: { parentId }
		}))
	);
}

// The checks that matter under concurrency run here, after the lock, against fresh rows.
async function write(subject: repo.Subject, action: string, move: Move, metadata?: object) {
	const from = subject.householdId;
	return db.transaction(async (tx) => {
		await repo.lockHouseholds(tx, [from]);
		if (move.keepOne && (await repo.livePeopleIn(from, tx)) <= 1)
			throw new ValidationError(move.failure);
		const back = move.dest.householdId;
		// A move back may return to a household closed when everyone left it.
		if (back) await repo.reopenHousehold(tx, back);
		const to = { ...move.dest, householdId: back ?? (await repo.insertHousehold(tx)) };
		await moveChildrenAlong(tx, [subject], to);
		const { householdId, ...address } = to;
		if (!(await repo.moveTo(tx, subject.id, from, householdId, address)))
			throw new ValidationError(move.failure);
		await repo.closeEmptyHouseholds(tx, [from]);
		await recordAudit(tx, {
			action,
			entityType: 'person',
			entityId: subject.id,
			branchId: subject.homeBranchId,
			diff: diffOf(placeOf(subject), to),
			metadata
		});
		return householdId;
	});
}

// The reason a move out would be refused, or null when it can go ahead.
async function moveOutRefusal(subject: repo.Subject) {
	if (subject.deceasedOn) return 'error_already_deceased';
	if (!isAdult(subject)) return 'error_not_adult';
	if ((await repo.livePeopleIn(subject.householdId)) <= 1) return 'error_already_alone';
	return null;
}

export const canMoveOut = async (personId: string) =>
	(await moveOutRefusal(await subjectOf(personId))) === null;

export async function recordMovedOut(personId: string, input: unknown) {
	const subject = await subjectOf(personId);
	const actor = await lifeChangeActor(subject);
	const refusal = await moveOutRefusal(subject);
	if (refusal) throw new ValidationError(refusal);
	const parsed = movedOutSchema.safeParse(input);
	if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
	const { line, postalCode, cityId } = parsed.data.address;
	const householdId = await write(
		subject,
		'person.moved_out',
		{
			dest: { addressLine: line, postalCode, cityId },
			failure: 'error_already_alone',
			keepOne: true
		},
		actedAs(actor)
	);
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
