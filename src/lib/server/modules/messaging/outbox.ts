import type { Transaction } from '$lib/server/db/client';
import type { Locale } from '$lib/paraglide/runtime';
import * as repo from './outbox-repository';
import {
	DeliveryError,
	sendMessage,
	type Channel,
	type MessageTemplate,
	type OutgoingMessage
} from './sender';

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = 5 * 60_000;
const LEASE_MS = 2 * 60_000;

export const enqueueMessage = (tx: Transaction, msg: OutgoingMessage) =>
	repo.insertMessage(tx, {
		channel: msg.channel,
		recipient: msg.to,
		template: msg.template,
		locale: msg.locale,
		params: msg.params,
		nextAttemptAt: new Date()
	});

export async function deliverOutbox(ids?: string[]): Promise<void> {
	const now = new Date();
	const due = await repo.claimDue(now, new Date(now.getTime() + LEASE_MS), ids);
	for (const row of due) {
		try {
			await sendMessage({
				channel: row.channel as Channel,
				to: row.recipient,
				template: row.template as MessageTemplate,
				locale: row.locale as Locale,
				params: row.params as Record<string, string>
			});
			await repo.markSent(row.id, new Date());
		} catch (err) {
			const attempts = row.attempts + 1;
			await repo.markFailedAttempt(row.id, {
				attempts,
				// Name or delivery message only: params can hold fix links and names.
				lastError: err instanceof DeliveryError ? err.message : String((err as Error)?.name),
				nextAttemptAt: new Date(Date.now() + BACKOFF_MS * attempts),
				giveUp: attempts >= MAX_ATTEMPTS
			});
		}
	}
}
