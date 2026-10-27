import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	accounts,
	auditLogs,
	households,
	memberProfiles,
	outboxMessages,
	people,
	personRelationships,
	registrationConsents,
	registrations
} from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makeAccount, makeHousehold, makePerson } from '$lib/server/db/test/factories';
import { approveRegistration } from './approve';
import { asStaff, setup } from './test-support';

const approve = (branchId: string, id: string) =>
	asStaff('branch_admin', branchId, () => approveRegistration(id));
let s: Awaited<ReturnType<typeof setup>>;
// The registration link factory already made its creator and their household.
const CREATOR = 1;

beforeEach(async () => {
	await resetDb();
	s = await setup();
});

const inHousehold = async (householdId: string) =>
	(await db.select().from(people).where(eq(people.householdId, householdId))).sort((a, b) =>
		a.fullName.localeCompare(b.fullName)
	);

describe('approveRegistration', () => {
	it('creates household, people, profiles, accounts, and relationships for a family of 4', async () => {
		const r = await s.reg(['self', 'spouse', 'child', 'child']);
		const { householdId } = await approve(s.branch.id, r.id);
		const [p1, p2, p3, p4] = await inHousehold(householdId);
		expect(p1.memberCode).toMatch(new RegExp(`^${s.branch.code}-\\d{4}-\\d{5}$`));
		expect(new Set([p1, p2, p3, p4].map((p) => p.memberCode)).size).toBe(4);
		expect(p1).toMatchObject({ isMember: true, homeBranchId: s.branch.id, preferredLocale: 'id' });
		expect(p2.registeredByPersonId).toBe(p1.id);
		expect(p1.nikEncrypted).toBeInstanceOf(Buffer);
		expect(await db.select().from(memberProfiles)).toHaveLength(4);
		const accs = await db.select().from(accounts);
		expect(accs).toHaveLength(4);
		expect(accs.every((a) => a.passwordHash === null && a.activatedAt === null)).toBe(true);

		const rels = await db.select().from(personRelationships);
		const key = (x: { kind: string; personId: string; relatedPersonId: string }) =>
			`${x.kind}:${x.personId}>${x.relatedPersonId}`;
		const spouse = [p1.id, p2.id].sort();
		expect(rels.map(key).sort()).toEqual(
			[
				`spouse:${spouse[0]}>${spouse[1]}`,
				`parent:${p1.id}>${p3.id}`,
				`parent:${p2.id}>${p3.id}`,
				`parent:${p1.id}>${p4.id}`,
				`parent:${p2.id}>${p4.id}`
			].sort()
		);
		const [reg] = await db.select().from(registrations).where(eq(registrations.id, r.id));
		expect(reg.status).toBe('approved');
		const audits = await db.select().from(auditLogs);
		expect(audits.filter((a) => a.action === 'person.created')).toHaveLength(4);
		expect(audits.find((a) => a.action === 'person.created')!.diff).toMatchObject({
			nik: { changed: true }
		});
		expect(JSON.stringify(audits)).not.toContain('nikHash');
		expect(audits.filter((a) => a.action === 'registration.approved')).toHaveLength(1);
	});

	it('gives two concurrent approvals in one branch different Member IDs', async () => {
		const [a, b] = await Promise.all([s.reg(['self', 'child']), s.reg(['self', 'child'])]);
		await Promise.all([approve(s.branch.id, a.id), approve(s.branch.id, b.id)]);
		const rows = await db.select({ code: people.memberCode }).from(people);
		expect(rows).toHaveLength(4 + CREATOR);
		expect(new Set(rows.map((r) => r.code)).size).toBe(4 + CREATOR);
	});

	it('approving the same registration twice creates one household', async () => {
		const r = await s.reg(['self']);
		const results = await Promise.allSettled([
			approve(s.branch.id, r.id),
			approve(s.branch.id, r.id)
		]);
		const failed = results.filter((x) => x.status === 'rejected');
		expect(failed).toHaveLength(1);
		expect((failed[0] as PromiseRejectedResult).reason.message).toBe('error_already_decided');
		expect(await db.select().from(households)).toHaveLength(1 + CREATOR);
		expect(await db.select().from(people)).toHaveLength(1 + CREATOR);
	});

	it('refuses while a consent is waiting', async () => {
		const r = await s.reg(['self', 'child']);
		const member = await makePerson({ homeBranchId: s.branch.id });
		await db
			.insert(registrationConsents)
			.values({ registrationId: r.id, personIndex: 1, matchedPersonId: member.id });
		await expect(approve(s.branch.id, r.id)).rejects.toThrow('error_waiting_for_consent');
		const [reg] = await db.select().from(registrations).where(eq(registrations.id, r.id));
		expect(reg.status).toBe('pending');
		expect(await db.select().from(households)).toHaveLength(1 + CREATOR); // the new household rolled back
	});

	it('moves a consenting member into the new household and keeps their Member ID', async () => {
		const r = await s.reg(['self', 'spouse']);
		const old = await makeHousehold();
		const member = await makePerson({
			homeBranchId: s.branch.id,
			householdId: old.id,
			memberCode: 'OLD-1'
		});
		await db.insert(registrationConsents).values({
			registrationId: r.id,
			personIndex: 1,
			matchedPersonId: member.id,
			decision: 'given'
		});
		const { householdId } = await approve(s.branch.id, r.id);
		const rows = await inHousehold(householdId);
		expect(rows).toHaveLength(2);
		expect(rows.find((p) => p.id === member.id)!.memberCode).toBe('OLD-1');
		const self = rows.find((p) => p.id !== member.id)!;
		const rels = await db.select().from(personRelationships);
		expect(rels).toHaveLength(1);
		expect(new Set([rels[0].personId, rels[0].relatedPersonId])).toEqual(
			new Set([self.id, member.id])
		);
		const [oldRow] = await db.select().from(households).where(eq(households.id, old.id));
		expect(oldRow.deletedAt).not.toBeNull();
	});

	it('skips a declined person and says so in the notice', async () => {
		const r = await s.reg(['self', 'child']);
		const member = await makePerson({ homeBranchId: s.branch.id });
		await db.insert(registrationConsents).values({
			registrationId: r.id,
			personIndex: 1,
			matchedPersonId: member.id,
			decision: 'declined'
		});
		const { householdId } = await approve(s.branch.id, r.id);
		expect(await inHousehold(householdId)).toHaveLength(1);
		expect(await db.select().from(personRelationships)).toHaveLength(0);
		const [msg] = await db.select().from(outboxMessages);
		expect(msg.params).toMatchObject({ someoneNotAdded: 'yes' });
	});

	it('enqueues one approved notice in the registration locale', async () => {
		const r = await s.reg(['self'], { locale: 'zh-Hans', contactEmail: 'a@mail.test' });
		await approve(s.branch.id, r.id);
		const msgs = await db.select().from(outboxMessages);
		expect(msgs).toHaveLength(1);
		expect(msgs[0]).toMatchObject({
			channel: 'email',
			recipient: 'a@mail.test',
			template: 'registration_approved',
			locale: 'zh-Hans'
		});
		expect(msgs[0].params).toMatchObject({
			name: 'Person 1',
			someoneNotAdded: 'no',
			activateUrl: expect.stringMatching(/\/activate$/)
		});
	});

	it('rolls back everything when a step fails', async () => {
		const owner = await makePerson({ homeBranchId: s.branch.id });
		await makeAccount(owner.id, { email: 'taken@mail.test' });
		const r = await s.reg(['self', 'child'], {}, [{ email: 'taken@mail.test' }]);
		const before = await db.select().from(households);
		await expect(approve(s.branch.id, r.id)).rejects.toThrow();
		expect(await db.select().from(households)).toHaveLength(before.length);
		expect(await db.select().from(outboxMessages)).toHaveLength(0);
		expect(await db.select().from(people)).toHaveLength(1 + CREATOR);
		const [reg] = await db.select().from(registrations).where(eq(registrations.id, r.id));
		expect(reg.status).toBe('pending');
	});

	it('hides registrations of other branches', async () => {
		const r = await s.reg(['self']);
		const other = await makePerson();
		await expect(approve(other.homeBranchId, r.id)).rejects.toThrow('not found');
	});
});
