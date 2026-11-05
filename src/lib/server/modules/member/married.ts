import type { z } from 'zod';
import { marriedExistingSchema, marriedNewSchema } from '$lib/life-change/schema';
import { db, type Transaction } from '$lib/server/db/client';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { recordAudits } from '$lib/server/modules/audit/service';
import { ageOn, todayIn } from '$lib/server/time';
import { lifeChangeActor, staffOnly } from './life-change-access';
import * as repo from './life-change-repository';
import * as marriages from './marriage-repository';
import { diffOf, placeOf } from './moved-out';
import { subjectOf } from './passed-away';

// The legal marriage age in Indonesia (UU 16/2019).
export const MARRIAGE_AGE = 19;
const oldEnough = (birthDate: string, on: string) => ageOn(birthDate, on) >= MARRIAGE_AGE;

type NewSpouse = z.infer<typeof marriedNewSchema>['spouse'];
type Wedding = { weddingOn: string; address: repo.Address };

// The one marriage rule, shared by the services and the household list.
export function marriageRule(
	person: { deceasedOn: string | null; birthDate: string },
	married: boolean,
	on: string
) {
	if (person.deceasedOn) return 'error_already_deceased';
	if (!oldEnough(person.birthDate, on)) return 'error_not_marriage_age';
	if (married) return 'error_already_married';
	return null;
}

export const marriageRefusal = async (subject: repo.Subject, weddingOn: string) =>
	marriageRule(subject, await marriages.hasLiveSpouse(subject.id), weddingOn);

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

function createdAudit(id: string, spouse: NewSpouse, at: repo.Address & Home) {
	const after = { ...spouse, isMember: false, ...at };
	const diff = Object.fromEntries(Object.entries(after).map(([k, v]) => [k, { after: v }]));
	return {
		action: 'person.created',
		entityType: 'person',
		entityId: id,
		branchId: at.homeBranchId,
		diff
	};
}

type Home = { householdId: string; homeBranchId: string };

// Both checks that matter under concurrency run after the household locks, so a double submit loses.
export async function marry(
	tx: Transaction,
	couple: repo.Subject[],
	w: Wedding,
	spouse?: NewSpouse
) {
	const leaving = [...new Set(couple.map((s) => s.householdId))];
	await repo.lockHouseholds(tx, leaving);
	if (
		(
			await marriages.liveSpouseIds(
				couple.map((s) => s.id),
				tx
			)
		).size
	)
		throw new ValidationError('error_already_married');
	const householdId = await repo.insertHousehold(tx);
	const at = { householdId, ...w.address, homeBranchId: couple[0].homeBranchId };
	const newId = spouse ? await marriages.insertPerson(tx, { ...spouse, ...at }) : undefined;
	const moves = couple.map((s) => ({ id: s.id, from: s.householdId }));
	// Someone moved or died since they were read: say so, rather than guess why.
	if ((await marriages.moveAll(tx, moves, householdId, w.address)) !== couple.length)
		throw new ValidationError('error_changed_meanwhile');
	const ids = [...couple.map((s) => s.id), ...(newId ? [newId] : [])];
	await marriages.insertSpouseLink(tx, ids[0], ids[1], w.weddingOn);
	await repo.closeEmptyHouseholds(tx, leaving);
	const other = (id: string) => ids.find((i) => i !== id)!;
	await recordAudits(tx, [
		...couple.map((s) => marriedAudit(s, householdId, other(s.id), w)),
		...(newId && spouse ? [createdAudit(newId, spouse, at)] : [])
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

// Missing and out of scope read the same, so the answer confirms nothing; a toast, not a 404 page.
async function chosenSpouse(id: string) {
	try {
		const spouse = await subjectOf(id);
		staffOnly(spouse);
		return spouse;
	} catch (err) {
		if (err instanceof NotFoundError) throw new ValidationError('error_spouse_unavailable');
		throw err;
	}
}

// Staff only: the other person belongs to another household, which a family cannot act on.
export async function recordMarriageToMember(personId: string, input: unknown) {
	const subject = await subjectOf(personId);
	staffOnly(subject);
	const data = parseWith(marriedExistingSchema, input);
	if (data.spouseId === subject.id) throw new ValidationError('error_same_person');
	const spouse = await chosenSpouse(data.spouseId);
	await assertMayMarry(subject, data.weddingOn);
	const refusal = await marriageRefusal(spouse, data.weddingOn);
	if (refusal) throw new ValidationError(refusal);
	const wedding = { weddingOn: data.weddingOn, address: toAddress(data.address) };
	const { householdId } = await db.transaction((tx) => marry(tx, [subject, spouse], wedding));
	return { householdId };
}
