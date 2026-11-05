import { z } from 'zod';
import { passedAwaySchema } from '$lib/life-change/schema';
import { db } from '$lib/server/db/client';
import { getContext } from '$lib/server/context';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { reactivateAccount, suspendAccount } from '$lib/server/modules/auth/account-status';
import { findAudits, recordAudit } from '$lib/server/modules/audit/service';
import { todayIn } from '$lib/server/time';
import { actedAs, lifeChangeActor, staffOnly } from './life-change-access';
import { findSubject, setDeceasedOn, type Subject } from './life-change-repository';

export async function subjectOf(id: string) {
	const subject = z.uuid().safeParse(id).success ? await findSubject(id) : undefined;
	if (!subject) throw new NotFoundError('Person', id);
	return subject;
}

const audit = (subject: Subject, action: string, diff: object, metadata?: object) => ({
	action,
	entityType: 'person',
	entityId: subject.id,
	branchId: subject.homeBranchId,
	diff,
	metadata
});

function parseDate(input: unknown, subject: Subject) {
	const parsed = passedAwaySchema.safeParse(input);
	if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
	const { deceasedOn } = parsed.data;
	if (deceasedOn > todayIn(subject.timezone)) throw new ValidationError('error_date_in_future');
	if (deceasedOn < subject.birthDate) throw new ValidationError('error_before_birth');
	return deceasedOn;
}

export async function recordPassedAway(personId: string, input: unknown) {
	const subject = await subjectOf(personId);
	const actor = await lifeChangeActor(subject);
	if (getContext().personId === subject.id)
		throw new ValidationError('error_cannot_record_own_death');
	const deceasedOn = parseDate(input, subject);
	if (subject.deceasedOn) throw new ValidationError('error_already_deceased');
	await db.transaction(async (tx) => {
		// The guarded update, not the read above, decides a race between two family members.
		if (!(await setDeceasedOn(tx, subject.id, deceasedOn, 'alive')))
			throw new ValidationError('error_already_deceased');
		const account = await suspendAccount(tx, subject.id);
		const diff = {
			deceasedOn: { before: null, after: deceasedOn },
			...(account && account.before !== account.after ? { accountStatus: account } : {})
		};
		await recordAudit(tx, audit(subject, 'person.passed_away', diff, actedAs(actor)));
	});
}

export async function undoPassedAway(personId: string) {
	const subject = await subjectOf(personId);
	staffOnly(subject);
	if (!subject.deceasedOn) throw new ValidationError('error_not_deceased');
	// Reactivate only a login this death suspended; one suspended before it stays suspended.
	const [death] = await findAudits('person', subject.id, 'person.passed_away');
	const suspendedByDeath = (death?.diff as { accountStatus?: unknown } | null)?.accountStatus;
	await db.transaction(async (tx) => {
		if (!(await setDeceasedOn(tx, subject.id, null, 'deceased')))
			throw new ValidationError('error_not_deceased');
		const account = suspendedByDeath ? await reactivateAccount(tx, subject.id) : null;
		const diff = {
			deceasedOn: { before: subject.deceasedOn, after: null },
			...(account ? { accountStatus: account } : {})
		};
		await recordAudit(tx, audit(subject, 'person.passed_away_undone', diff));
	});
}
