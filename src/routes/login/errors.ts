import { fail } from '@sveltejs/kit';
import { ValidationError } from '$lib/server/errors';

export type LoginErrorKey =
	| 'error_invalid_credentials'
	| 'error_try_again_later'
	| 'error_identifier_invalid'
	| 'error_invalid_code'
	| 'error_resend_wait'
	| 'error_too_many_codes'
	| 'error_code_not_sent';

// Service errors carry their message key; anything else is unexpected and rethrown.
export function loginFailure(err: unknown) {
	if (err instanceof ValidationError) return fail(400, { error: err.message as LoginErrorKey });
	throw err;
}
