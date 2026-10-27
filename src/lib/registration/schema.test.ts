import { describe, expect, it } from 'vitest';
import { registrationSchema } from './schema';

const uuid = '0190a000-0000-7000-8000-000000000001';
const person = (
	relation: string,
	extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
	relation,
	fullName: 'Budi Santoso',
	nickname: 'Budi',
	sex: 'male',
	birthDate: '1990-05-01',
	birthCityId: uuid,
	address: { line: 'Jl. Mawar 1', postalCode: '12345', cityId: uuid },
	occupation: 'employee',
	education: 'bachelor',
	previousChurch: null,
	baptism: { baptized: false },
	sidi: { sidi: false },
	...extra
});
const make = person;
const family = () => [
	make('self', { email: 'Budi@Mail.test', nik: '3174 0123 4567 0001' }),
	make('spouse', { phone: '081234567890' }),
	make('child'),
	make('child')
];
const issuesOf = (people: unknown[]) => {
	const r = registrationSchema.safeParse({ people });
	return r.success
		? []
		: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
};

describe('registrationSchema', () => {
	it('parses a family of 4 and normalizes contacts and NIK', () => {
		const r = registrationSchema.parse({ people: family() });
		expect(r.parentsMarried).toBe(true);
		expect(r.people[0].email).toBe('budi@mail.test');
		expect(r.people[0].nik).toBe('3174012345670001');
		expect(r.people[1].phone).toBe('+6281234567890');
	});

	it('fails a baptized person without a date, on the date key', () => {
		const people = family();
		people[0].baptism = { baptized: true, church: 'GRII' } as never;
		expect(issuesOf(people).map((i) => i.path)).toContain('people.0.baptism.date');
	});

	it('fails the later of two people sharing a phone', () => {
		const people = family();
		people[0].phone = '+6281234567890' as never;
		expect(issuesOf(people)).toContainEqual({
			path: 'people.1.phone',
			message: 'error_duplicate_in_form'
		});
	});

	it('requires email or phone for the registrant', () => {
		const people = family();
		delete (people[0] as { email?: string }).email;
		expect(issuesOf(people).map((i) => i.message)).toContain('error_contact_required');
	});

	it('rejects a third parent and a second spouse', () => {
		const parents = [
			make('self', { phone: '0811111111' }),
			make('parent'),
			make('parent'),
			make('parent')
		];
		expect(issuesOf(parents).map((i) => i.path)).toContain('people.3.relation');
		const spouses = [make('self', { phone: '0811111111' }), make('spouse'), make('spouse')];
		expect(issuesOf(spouses).map((i) => i.path)).toContain('people.2.relation');
	});

	it('rejects a future birth date, a short NIK and more than 15 people', () => {
		const people = family();
		people[2].birthDate = '2999-01-01';
		people[3].nik = '123' as never;
		const paths = issuesOf(people).map((i) => i.path);
		expect(paths).toContain('people.2.birthDate');
		expect(paths).toContain('people.3.nik');
		const many = [family()[0], ...Array.from({ length: 15 }, () => make('child'))];
		expect(issuesOf(many).map((i) => i.path)).toContain('people');
	});

	it('requires a postal code', () => {
		const people = family();
		delete (people[1].address as { postalCode?: string }).postalCode;
		expect(issuesOf(people)).toContainEqual({
			path: 'people.1.address.postalCode',
			message: 'error_required'
		});
	});

	it('treats blank optional fields as absent', () => {
		const people = family();
		Object.assign(people[1], { nik: '', email: ' ', phone: '', chineseName: '' });
		Object.assign(people[0], { phone: '' });
		const r = registrationSchema.parse({ people });
		expect(r.people[1]).toMatchObject({
			nik: undefined,
			email: undefined,
			phone: undefined,
			chineseName: undefined
		});
		expect(r.people[0].phone).toBeUndefined();
	});

	it('still requires registrant contact when email and phone are blank', () => {
		const people = family();
		Object.assign(people[0], { email: '', phone: '' });
		expect(issuesOf(people).map((i) => i.message)).toContain('error_contact_required');
	});

	it('requires the previousChurch key', () => {
		const people = family();
		delete people[0].previousChurch;
		expect(issuesOf(people)).toContainEqual({
			path: 'people.0.previousChurch',
			message: 'error_required'
		});
	});

	it('calls an empty birth date and an unanswered yes/no required', () => {
		const people = family();
		Object.assign(people[0], { birthDate: '', baptism: { baptized: null }, sidi: {} });
		const issues = issuesOf(people);
		expect(issues).toContainEqual({ path: 'people.0.birthDate', message: 'error_required' });
		expect(issues.find((i) => i.path.startsWith('people.0.baptism'))?.message).toBe(
			'error_required'
		);
		expect(issues.find((i) => i.path.startsWith('people.0.sidi'))?.message).toBe('error_required');
	});
});
