import { ValidationError } from '$lib/server/errors';
import * as repo from './repository';

export async function assertNotLocked(identifierHash: string): Promise<void> {
	const lockedUntil = await repo.findLockedUntil(identifierHash);
	if (lockedUntil && lockedUntil > new Date()) throw new ValidationError('error_try_again_later');
}

export const recordFailure = (identifierHash: string) => repo.upsertFailure(identifierHash);

export const clearFailures = (identifierHash: string) => repo.deleteThrottle(identifierHash);
