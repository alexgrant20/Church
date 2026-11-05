import type { z } from 'zod';
import { marriedExistingSchema, marriedNewSchema } from '$lib/life-change/schema';
import { db, type Transaction } from '$lib/server/db/client';
import { ValidationError } from '$lib/server/errors';
import { recordAudits } from '$lib/server/modules/audit/service';
import { ageOn, todayIn } from '$lib/server/time';
import { lifeChangeActor, staffOnly } from './life-change-access';
import * as repo from './life-change-repository';
import { diffOf, placeOf } from './moved-out';
import { subjectOf } from './passed-away';

// The legal marriage age in Indonesia (UU 16/2019).
export const MARRIAGE_AGE = 19;
const oldEnough = (birthDate: string, on: string) => ageOn(birthDate, on) >= MARRIAGE_AGE;

type NewSpouse = z.infer<typeof marriedNewSchema>['spouse'];
type Wedding = { weddingOn: string; address: repo.Address };

export async function marriageRefusal(subject: repo.Subject, weddingOn: string) {
	if (subject.deceasedOn) return 'error_already_deceased';
	if (!oldEnough(subject.birthDate, weddingOn)) return 'error_not_marriage_age';
	if (await repo.hasLiveSpouse(subject.id)) return 'error_already_married';
	return null;
}

export async function canMarry(personId: string) {
	const subject = await subjectOf(personId);
	return (await marriageRefusal(subject, todayIn(subject.timezone))) === null;
}

export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
	const parsed = schema.safeParse(input);
	if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
	return parsed.data;
}

export async function assertMayMarry(subject: repo.Subject, weddingOn: string) {
	if (weddingOn > todayIn(subject.timezone)) throw new ValidationError('error_date_in_future');
	const refusal = await marriageRefusal(subject, weddingOn);
	if (refusal) throw new ValidationError(refusal);
}

function marriedAudit(s: repo.Subject, to: string, spouseId: string, w: Wedding) {
	const diff = {
		...diffOf(placeOf(s), { householdId: to, ...w.address }),
		spouseId: { after: spouseId },
		weddingOn: { after: w.weddingOn }
	};
	return {
		action: 'person.married',
		entityType: 'person',
		entityId: s.id,
		branchId: s.homeBranchId,
		diff
	};
}

function createdAudit(id: string, spouse: NewSpouse, householdId: string, branchId: string) {
	const after = { ...spouse, isMember: false, householdId };
	const diff = Object.fromEntries(Object.entries(after).map(([k, v]) => [k, { after: v }]));
	return { action: 'person.created', entityType: 'person', entityId: id, branchId, diff };
}

// Both checks that matter under concurrency run after the household locks, so a double submit loses.
export async function marry(
	tx: Transaction,
	couple: repo.Subject[],
	w: Wedding,
	spouse?: NewSpouse
) {
	const leaving = [...new Set(couple.map((s) => s.householdId))].sort();
	for (const h of leaving) await repo.lockHousehold(tx, h);
	for (const s of couple)
		if (await repo.hasLiveSpouse(s.id, tx)) throw new ValidationError('error_already_married');
	const householdId = await repo.insertHousehold(tx);
	const at = { householdId, ...w.address, homeBranchId: couple[0].homeBranchId };
	const newId = spouse ? await repo.insertPerson(tx, { ...spouse, ...at }) : undefined;
	for (const s of couple)
		if (!(await repo.moveTo(tx, s.id, s.householdId, householdId, w.address)))
			throw new ValidationError('error_already_married');
	const ids = [...couple.map((s) => s.id), ...(newId ? [newId] : [])];
	await repo.insertSpouseLink(tx, ids[0], ids[1], w.weddingOn);
	for (const h of leaving)
		if ((await repo.livePeopleIn(h, tx)) === 0) await repo.softDeleteHousehold(tx, h);
	const other = (id: string) => ids.find((i) => i !== id)!;
	await recordAudits(tx, [
		...couple.map((s) => marriedAudit(s, householdId, other(s.id), w)),
		...(newId && spouse ? [createdAudit(newId, spouse, householdId, at.homeBranchId)] : [])
	]);
	return { householdId, spouseId: other(couple[0].id) };
}

const toAddress = (a: { line: string; postalCode: string; cityId: string }): repo.Address => ({
	addressLine: a.line,
	postalCode: a.postalCode,
	cityId: a.cityId
});

export async function recordMarriage(personId: string, input: unknown) {
	const subject = await subjectOf(personId);
	await lifeChangeActor(subject);
	const data = parseWith(marriedNewSchema, input);
	await assertMayMarry(subject, data.weddingOn);
	if (!oldEnough(data.spouse.birthDate, data.weddingOn))
		throw new ValidationError('error_not_marriage_age');
	const wedding = { weddingOn: data.weddingOn, address: toAddress(data.address) };
	return db.transaction((tx) => marry(tx, [subject], wedding, data.spouse));
}

// Staff only: the other person belongs to another household, which a family cannot act on.
export async function recordMarriageToMember(personId: string, input: unknown) {
	const subject = await subjectOf(personId);
	staffOnly(subject);
	const data = parseWith(marriedExistingSchema, input);
	if (data.spouseId === subject.id) throw new ValidationError('error_same_person');
	const spouse = await subjectOf(data.spouseId);
	staffOnly(spouse);
	await assertMayMarry(subject, data.weddingOn);
	const refusal = await marriageRefusal(spouse, data.weddingOn);
	if (refusal) throw new ValidationError(refusal);
	const wedding = { weddingOn: data.weddingOn, address: toAddress(data.address) };
	const { householdId } = await db.transaction((tx) => marry(tx, [subject, spouse], wedding));
	return { householdId };
}
