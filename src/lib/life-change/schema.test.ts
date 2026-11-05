import { describe, it, expect } from 'vitest';
import {
	marriedExistingSchema,
	marriedNewSchema,
	movedOutSchema,
	passedAwaySchema
} from './schema';

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

describe('marriage schemas', () => {
	const address = { line: 'Jl. Nikah 1', postalCode: '10110', cityId: crypto.randomUUID() };
	const spouse = { fullName: 'Rani', nickname: 'Rani', sex: 'female', birthDate: '1995-01-01' };

	it('requires the new spouse’s full name', () => {
		const r = marriedNewSchema.safeParse({
			weddingOn: day(0),
			spouse: { ...spouse, fullName: '' },
			address
		});
		expect(firstMessage(r)).toBe('error_required');
	});

	it('rejects a wedding date two days ahead', () => {
		const r = marriedNewSchema.safeParse({ weddingOn: day(2), spouse, address });
		expect(firstMessage(r)).toBe('error_date_in_future');
	});

	it('requires the existing spouse to be chosen', () => {
		const r = marriedExistingSchema.safeParse({ weddingOn: day(0), address });
		expect(firstMessage(r)).toBe('error_required');
	});
});
