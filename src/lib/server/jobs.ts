import { deliverOutbox } from '$lib/server/modules/messaging/outbox';
import { purgeExpired } from './jobs-repository';

// shortcut: in-process interval, one app instance only; move to a real scheduler before running more than one instance.
export async function runJobs(): Promise<void> {
	await deliverOutbox();
	const now = new Date();
	const month = new Date(now);
	month.setMonth(month.getMonth() - 1);
	await purgeExpired({ day: new Date(now.getTime() - 86_400_000), month });
}
