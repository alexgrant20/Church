import { error, fail } from '@sveltejs/kit';

export class NotFoundError extends Error {
	constructor(entity: string, id: string) {
		super(`${entity} ${id} not found`);
		this.name = 'NotFoundError';
	}
}

export class ForbiddenError extends Error {
	constructor(message = 'Forbidden') {
		super(message);
		this.name = 'ForbiddenError';
	}
}

export class ValidationError extends Error {
	issues?: unknown;

	constructor(message: string, issues?: unknown) {
		super(message);
		this.name = 'ValidationError';
		this.issues = issues;
	}
}

export function mapErrorToHttp(err: unknown): never {
	if (err instanceof NotFoundError) throw error(404, err.message);
	if (err instanceof ForbiddenError) throw error(403, err.message);
	if (err instanceof ValidationError) throw error(400, err.message);
	console.error(err);
	throw error(500, 'Internal server error');
}

// A form action's result: a validation error stays on the page as a message key; anything else
// becomes an HTTP error.
export async function runAction(action: () => Promise<unknown>) {
	try {
		await action();
		return { ok: true };
	} catch (err) {
		if (err instanceof ValidationError) return fail(400, { error: err.message });
		mapErrorToHttp(err);
	}
}
