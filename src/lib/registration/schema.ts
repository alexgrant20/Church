import { z } from 'zod';
import { personSchema } from './person';

const UNIQUE_FIELDS = ['nik', 'email', 'phone'] as const;

export const registrationSchema = z
	.object({
		people: z.array(personSchema).min(1, 'error_required').max(15, 'error_too_many_people'),
		parentsMarried: z.boolean().default(true)
	})
	.superRefine(({ people }, ctx) => {
		const fail = (path: (string | number)[], message: string) =>
			ctx.addIssue({ code: 'custom', path: ['people', ...path], message });

		people.forEach((p, i) => {
			if ((p.relation === 'self') !== (i === 0)) fail([i, 'relation'], 'error_invalid_relation');
		});
		if (people.filter((p) => p.relation === 'spouse').length > 1) {
			fail([people.findLastIndex((p) => p.relation === 'spouse'), 'relation'], 'error_too_many');
		}
		const parents = people.flatMap((p, i) => (p.relation === 'parent' ? [i] : []));
		if (parents.length > 2) fail([parents[2], 'relation'], 'error_too_many');

		const [self] = people;
		if (self && !self.email && !self.phone) fail([0, 'phone'], 'error_contact_required');

		for (const field of UNIQUE_FIELDS) {
			const seen = new Set<string>();
			people.forEach((p, i) => {
				const value = p[field];
				if (!value) return;
				if (seen.has(value)) fail([i, field], 'error_duplicate_in_form');
				seen.add(value);
			});
		}
	});

export type RegistrationInput = z.infer<typeof registrationSchema>;
