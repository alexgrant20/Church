import { describe, it, expect } from 'vitest';
import { movedOutSchema, passedAwaySchema } from './schema';

const firstMessage = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
	r.error?.issues[0].message;
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('passedAwaySchema', () => {
	it('accepts today', () => {
		expect(passedAwaySchema.safeParse({ deceasedOn: day(0) }).success).toBe(true);
	});

	it('rejects a date in the future', () => {
		expect(firstMessage(passedAwaySchema.safeParse({ deceasedOn: day(2) }))).toBe(
			'error_date_in_future'
		);
	});

	it('requires a date', () => {
		expect(firstMessage(passedAwaySchema.safeParse({ deceasedOn: '' }))).toBe('error_required');
	});
});

describe('movedOutSchema', () => {
	it('requires a city', () => {
		const r = movedOutSchema.safeParse({ address: { line: 'Jl. Baru 1', postalCode: '10110' } });
		expect(firstMessage(r)).toBe('error_required');
	});
});
