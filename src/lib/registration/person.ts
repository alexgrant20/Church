import { z } from 'zod';
import { parseContact } from './contact';
import { EDUCATIONS, OCCUPATIONS } from './options';

export const RELATIONS = ['self', 'spouse', 'child', 'parent', 'sibling'] as const;

const text = (max: number) =>
	z.string('error_required').trim().min(1, 'error_required').max(max, 'error_too_long');
const today = () => new Date().toISOString().slice(0, 10);
// Browsers post "" for an empty input; treat it as absent.
const blankTo = (empty: undefined | null) => (v: unknown) =>
	typeof v === 'string' && v.trim() === '' ? empty : v;
const optional = <T extends z.ZodType>(schema: T) =>
	z.preprocess(blankTo(undefined), schema.optional());
const date = z.iso.date('error_invalid_date');

function sacrament<K extends 'baptized' | 'sidi'>(flag: K) {
	return z.discriminatedUnion(flag, [
		z.object({ [flag]: z.literal(false) } as { [P in K]: z.ZodLiteral<false> }),
		z.object({ [flag]: z.literal(true), date, church: text(255) } as {
			[P in K]: z.ZodLiteral<true>;
		} & { date: typeof date; church: ReturnType<typeof text> })
	]);
}

const contact = (kind: 'email' | 'phone') =>
	optional(
		z
			.string()
			.trim()
			.transform((v, ctx) => {
				const parsed = parseContact(v);
				if (parsed?.kind !== kind) {
					ctx.addIssue({ code: 'custom', message: `error_invalid_${kind}` });
					return z.NEVER;
				}
				return parsed.value;
			})
	);

const nik = optional(
	z
		.string()
		.transform((v) => v.replace(/\D/g, ''))
		.refine((v) => v.length === 16, 'error_invalid_nik')
);

export const personSchema = z.object({
	relation: z.enum(RELATIONS),
	fullName: text(255),
	nickname: text(100),
	chineseName: optional(z.string().trim().max(50, 'error_too_long')),
	sex: z.enum(['male', 'female'], 'error_required'),
	birthDate: date.refine((d) => d <= today(), 'error_date_in_future'),
	birthCityId: z.uuid('error_required'),
	nik,
	email: contact('email'),
	phone: contact('phone'),
	address: z.object({
		line: text(500),
		postalCode: text(10),
		cityId: z.uuid('error_required')
	}),
	occupation: z.enum(OCCUPATIONS, 'error_required'),
	education: z.enum(EDUCATIONS, 'error_required'),
	previousChurch: z.preprocess(
		blankTo(null),
		z.string('error_required').trim().max(255, 'error_too_long').nullable()
	),
	baptism: sacrament('baptized'),
	sidi: sacrament('sidi'),
	notChildOfSpouse: z.boolean().optional()
});
