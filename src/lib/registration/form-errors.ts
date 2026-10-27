import type { z } from 'zod';
import { personSchema } from './person';
import { registrationSchema } from './schema';

// The same nested shape superforms returns: { people: { 1: { phone: ['key'] } }, _errors?: [...] }.
export type FormErrors = { _errors?: string[] } & { [key: string]: unknown };

type Issue = Pick<z.core.$ZodIssue, 'path' | 'message'>;

function addLeaf(node: FormErrors, key: string, message: string) {
	const current = node[key];
	if (current && !Array.isArray(current)) ((current as FormErrors)._errors ??= []).push(message);
	else node[key] = [...((current as string[]) ?? []), message];
}

function child(node: FormErrors, key: string): FormErrors {
	const current = node[key];
	if (Array.isArray(current)) node[key] = { _errors: current };
	return (node[key] ??= {}) as FormErrors;
}

export function toErrors(issues: Issue[]): FormErrors | null {
	if (!issues.length) return null;
	const root: FormErrors = {};
	for (const { path, message } of issues) {
		const keys = path.map(String);
		const last = keys.pop();
		const node = keys.reduce(child, root);
		if (last === undefined) (root._errors ??= []).push(message);
		else addLeaf(node, last, message);
	}
	return root;
}

export function firstPersonWithError(errors: FormErrors): number | null {
	const people = errors.people as FormErrors | undefined;
	const indexes = Object.keys(people ?? {})
		.filter((k) => /^\d+$/.test(k))
		.map(Number);
	return indexes.length ? Math.min(...indexes) : null;
}

// The registrant is checked with the registration schema so the email-or-phone rule applies;
// cross-person rules (duplicates, how many parents) wait for the full check on submit.
export function validatePeople(people: unknown[], indexes: number[]): FormErrors | null {
	const issues = indexes.flatMap((i): Issue[] => {
		if (i === 0) {
			const r = registrationSchema.safeParse({ people: [people[0]] });
			return r.success ? [] : r.error.issues;
		}
		const r = personSchema.safeParse(people[i]);
		return r.success
			? []
			: r.error.issues.map((is) => ({ ...is, path: ['people', i, ...is.path] }));
	});
	return toErrors(issues);
}

export function validateAll(data: unknown): FormErrors | null {
	const r = registrationSchema.safeParse(data);
	return r.success ? null : toErrors(r.error.issues);
}
