import { expect } from 'vitest';

// Drizzle wraps the Postgres error, so the constraint text lives on `cause`.
export async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
	const err = await promise.then(
		() => null,
		(e: unknown) => e
	);
	expect(err).not.toBeNull();
	expect((err as { cause?: Error }).cause?.message).toMatch(pattern);
}
