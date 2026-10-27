import { lt } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { errorLogs, loginThrottles, otpCodes, registrationThrottles } from '$lib/server/db/schema';

export async function purgeExpired(cutoffs: { day: Date; month: Date }): Promise<void> {
	await db.delete(otpCodes).where(lt(otpCodes.createdAt, cutoffs.day));
	await db.delete(loginThrottles).where(lt(loginThrottles.updatedAt, cutoffs.day));
	await db
		.delete(registrationThrottles)
		.where(lt(registrationThrottles.windowStartedAt, cutoffs.day));
	await db.delete(errorLogs).where(lt(errorLogs.createdAt, cutoffs.month));
}
