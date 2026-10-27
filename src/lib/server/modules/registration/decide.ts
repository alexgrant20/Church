import { db, type Transaction } from '$lib/server/db/client';
import { config } from '$lib/server/config';
import { getContext } from '$lib/server/context';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import type { Locale } from '$lib/paraglide/runtime';
import type { RegistrationInput } from '$lib/registration/schema';
import { recordAudit } from '$lib/server/modules/audit/service';
import { generateSessionToken, hashSessionToken } from '$lib/server/modules/auth/token';
import { deliverOutbox, enqueueMessage } from '$lib/server/modules/messaging/outbox';
import type { OutgoingMessage } from '$lib/server/modules/messaging/sender';
import * as repo from './decide-repository';
import { findSameNameAndBirth, type BranchScope } from './review-repository';
import { reviewScope } from './review-service';
import { consentMessage } from './submit';

type Registration = NonNullable<Awaited<ReturnType<typeof repo.claimPending>>>;

export function deliverAfterCommit(ids: string[]) {
	if (!ids.length) return;
	// Not awaited: a slow provider must not hold up the staff reply. The outbox retries failures.
	deliverOutbox(ids).catch((err) => console.error('delivery failed', (err as Error)?.name));
}

// Email wins because it can carry the fix reason; WhatsApp is the fallback.
export function noticeTo(reg: Registration, template: OutgoingMessage['template']) {
	const channel = reg.contactEmail ? ('email' as const) : ('whatsapp' as const);
	return {
		channel,
		to: (reg.contactEmail ?? reg.contactPhone)!,
		template,
		locale: reg.locale as Locale
	};
}

export const registrantName = (reg: Registration) =>
	(reg.payload as { people: { fullName: string }[] }).people[0].fullName;

const inScopeBranch = (scope: BranchScope, branchId: string) =>
	scope === 'all' || scope.includes(branchId);

export async function claim(
	tx: Transaction,
	id: string,
	set: Parameters<typeof repo.claimPending>[3]
): Promise<Registration> {
	const scope = reviewScope();
	const row = await repo.claimPending(tx, id, scope, set);
	if (row) return row;
	// Same error for missing and out-of-scope ids, so existence never leaks.
	if (!(await repo.findInScope(tx, id, scope))) throw new NotFoundError('Registration', id);
	throw new ValidationError('error_already_decided');
}

export const decided = () => ({ decidedByPersonId: getContext().personId, decidedAt: new Date() });

export async function requestFix(id: string, reason: string): Promise<void> {
	const token = generateSessionToken();
	const messageId = await db.transaction(async (tx) => {
		const reg = await claim(tx, id, {
			status: 'needs_fix',
			fixReason: reason,
			fixTokenHash: hashSessionToken(token)
		});
		const notice = noticeTo(reg, 'registration_needs_fix');
		const messageId = await enqueueMessage(tx, {
			...notice,
			params: {
				name: registrantName(reg),
				fixUrl: `${config.ORIGIN}/register/fix/${token}`,
				// Free text from staff stays out of WhatsApp.
				reason: notice.channel === 'email' ? reason : ''
			}
		});
		await recordAudit(tx, {
			action: 'registration.needs_fix',
			entityType: 'registration',
			entityId: id,
			branchId: reg.branchId,
			diff: { status: { before: 'pending', after: 'needs_fix' }, fixReason: { after: reason } }
		});
		return messageId;
	});
	deliverAfterCommit([messageId]);
}

export async function markSpam(id: string): Promise<void> {
	await db.transaction(async (tx) => {
		const reg = await claim(tx, id, { status: 'spam', ...decided() });
		await recordAudit(tx, {
			action: 'registration.spam',
			entityType: 'registration',
			entityId: id,
			branchId: reg.branchId,
			diff: { status: { before: 'pending', after: 'spam' } }
		});
	});
}

export async function recordInPersonConsent(registrationId: string, personIndex: number) {
	const scope = reviewScope();
	await db.transaction(async (tx) => {
		const reg = await repo.findInScope(tx, registrationId, scope);
		if (!reg) throw new NotFoundError('Registration', registrationId);
		const by = getContext().personId;
		if (!(await repo.markConsentGiven(tx, registrationId, personIndex, by))) {
			throw new NotFoundError('Consent', `${registrationId}/${personIndex}`);
		}
		await recordAudit(tx, {
			action: 'registration.consent_recorded',
			entityType: 'registration',
			entityId: registrationId,
			branchId: reg.branchId,
			diff: { consent: { personIndex, decision: { before: 'waiting', after: 'given' } } }
		});
	});
}

export async function sendConsentRequest(
	registrationId: string,
	personIndex: number,
	memberPersonId: string
): Promise<void> {
	const scope = reviewScope();
	const ids = await db.transaction(async (tx) => {
		const reg = await repo.findInScope(tx, registrationId, scope);
		const people = (reg?.payload as RegistrationInput | undefined)?.people;
		const candidate = people?.[personIndex];
		if (!reg || !candidate) throw new NotFoundError('Registration', registrationId);
		// Only a member shown as the name-and-birth-date warning may be asked.
		const matches = await findSameNameAndBirth([candidate]);
		const member = await repo.findMemberWithAccount(tx, memberPersonId);
		if (
			!member ||
			!matches.some((m) => m.id === memberPersonId && inScopeBranch(scope, m.homeBranchId))
		) {
			throw new NotFoundError('Person', memberPersonId);
		}
		const token = member.activatedAt ? generateSessionToken() : null;
		const created = await repo.insertConsent(tx, {
			registrationId,
			personIndex,
			matchedPersonId: memberPersonId,
			tokenHash: token ? hashSessionToken(token) : null
		});
		if (!created) throw new ValidationError('error_consent_exists');
		await recordAudit(tx, {
			action: 'registration.consent_requested',
			entityType: 'registration',
			entityId: registrationId,
			branchId: reg.branchId,
			diff: { consent: { personIndex, matchedPersonId: { after: memberPersonId } } }
		});
		if (!token) return [];
		return [await enqueueMessage(tx, consentMessage(member, people![0].fullName, token))];
	});
	deliverAfterCommit(ids);
}
