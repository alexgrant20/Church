import { getContext } from '$lib/server/context';
import { decryptNik, maskNik } from '$lib/server/crypto';
import { ForbiddenError, NotFoundError } from '$lib/server/errors';
import { getAccessibleBranchIds } from '$lib/server/modules/branch/access';
import { toPage, type Cursor } from '$lib/server/pagination';
import type { RegistrationInput } from '$lib/registration/schema';
import * as repo from './review-repository';

type Person = Omit<RegistrationInput['people'][number], 'nik'>;
type StoredPerson = Person & { nikEncrypted?: string; nikHash?: string };
type Consent = 'waiting' | 'given' | 'declined' | 'in_person_needed';
type Warning = { personId: string; memberCode: string; fullName: string };

// Only these roles review; the scope comes from them alone, so a pastor role elsewhere adds no access.
function reviewScope(): repo.BranchScope {
	const ctx = getContext();
	const roleAssignments = ctx.roleAssignments.filter(
		(r) => r.role === 'superadmin' || r.role === 'branch_admin'
	);
	if (!roleAssignments.length) throw new ForbiddenError();
	return getAccessibleBranchIds({ ...ctx, roleAssignments });
}

export async function listRegistrations(input: {
	status: 'pending' | 'needs_fix';
	cursor: Cursor | null;
	limit: number;
}) {
	const rows = await repo.listQueue({ ...input, scope: reviewScope() });
	const page = toPage(rows, input.limit, (r) => r.cursorKey);
	return {
		items: page.items.map((r) => ({
			id: r.id,
			registrantName: r.registrantName,
			peopleCount: r.peopleCount,
			submittedAt: r.submittedAt,
			waitingConsents: r.waitingConsents
		})),
		nextCursor: page.nextCursor
	};
}

export async function countPendingRegistrations(): Promise<number> {
	return repo.countPending(reviewScope());
}

function toConsent(row?: { decision: 'waiting' | 'given' | 'declined'; inPersonOnly: boolean }) {
	if (!row) return undefined;
	return row.decision === 'waiting' && row.inPersonOnly ? 'in_person_needed' : row.decision;
}

function present(stored: StoredPerson) {
	const person: Person & { nikMasked?: string } = { ...stored };
	if (stored.nikEncrypted) {
		person.nikMasked = maskNik(decryptNik(Buffer.from(stored.nikEncrypted, 'base64')));
	}
	delete (person as StoredPerson).nikEncrypted;
	delete (person as StoredPerson).nikHash;
	return person;
}

export async function getRegistration(id: string) {
	const row = await repo.findDetail(id, reviewScope());
	if (!row) throw new NotFoundError('Registration', id);
	const stored = (row.payload as { people: StoredPerson[] }).people;
	const [consents, matches] = await Promise.all([
		repo.consentsOf(id),
		repo.findSameNameAndBirth(stored)
	]);
	const people = stored.map((p, i) => ({
		...present(p),
		consent: toConsent(consents.find((c) => c.personIndex === i)) as Consent | undefined,
		warnings: matches
			.filter((m) => m.idx === i)
			.map((m): Warning => ({ personId: m.id, memberCode: m.memberCode, fullName: m.fullName }))
	}));
	return { id, status: row.status, branchName: row.branchName, fixReason: row.fixReason, people };
}
