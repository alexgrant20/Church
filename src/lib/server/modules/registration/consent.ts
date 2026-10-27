import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { getContext } from '$lib/server/context';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { recordAudit } from '$lib/server/modules/audit/service';
import { hashSessionToken } from '$lib/server/modules/auth/token';
import * as repo from './fix-repository';

const decisionSchema = z.enum(['given', 'declined']);

// Unknown, spent, and someone else's tokens look the same, so a stranger learns nothing.
async function ownWaitingConsent(tokenHash: string) {
	const consent = await repo.findWaitingConsent(tokenHash);
	const personId = getContext().personId;
	if (!consent || !personId || consent.matchedPersonId !== personId) {
		throw new NotFoundError('Consent', 'unknown');
	}
	return consent;
}

export async function loadConsent(token: string) {
	const consent = await ownWaitingConsent(hashSessionToken(token));
	return { registrantName: consent.registrantName, branchName: consent.branchName };
}

export async function decideConsent(token: string, input: unknown): Promise<void> {
	const parsed = decisionSchema.safeParse(input);
	if (!parsed.success) throw new ValidationError('error_invalid_decision');
	const decision = parsed.data;
	const tokenHash = hashSessionToken(token);
	const consent = await ownWaitingConsent(tokenHash);
	await db.transaction(async (tx) => {
		const reg = await repo.lockRegistration(tx, consent.registrationId);
		if (reg?.status !== 'pending') throw new ValidationError('error_already_decided');
		const decided = await repo.decideWaiting(tx, tokenHash, decision, new Date());
		if (!decided) throw new NotFoundError('Consent', 'unknown');
		await recordAudit(tx, {
			action: decision === 'given' ? 'registration.consent_given' : 'registration.consent_declined',
			entityType: 'registration',
			entityId: consent.registrationId,
			branchId: reg.branchId,
			diff: {
				consent: {
					personIndex: decided.personIndex,
					decision: { before: 'waiting', after: decision }
				}
			}
		});
	});
}
