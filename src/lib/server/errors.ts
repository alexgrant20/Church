import { error } from '@sveltejs/kit';

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
