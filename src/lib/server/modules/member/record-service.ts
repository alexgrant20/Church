import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { decryptNik, maskNik } from '$lib/server/crypto';
import { NotFoundError } from '$lib/server/errors';
import { recordAudit } from '$lib/server/modules/audit/service';
import { getSetting } from '$lib/server/modules/settings/service';
import type { AccessibleBranches } from '$lib/server/modules/branch/access';
import { viewAccess, type HouseholdBranch } from './access';
import * as repo from './record-repository';
import { memberScope } from './scope';

type Detail = NonNullable<Awaited<ReturnType<typeof repo.findPersonDetail>>>;
type Linked = Awaited<ReturnType<typeof repo.relationshipsOf>>[number];
type Relation = 'spouse' | 'parent' | 'child' | 'household';

export type Relative = {
	id: string;
	fullName: string;
	memberCode: string | null;
	relation: Relation;
	deceased: boolean;
	linkable: boolean;
};

const relationOf = (row: Linked, personId: string): Relation =>
	row.kind === 'spouse' ? 'spouse' : row.parentId === personId ? 'child' : 'parent';

function toRelative(
	p: {
		id: string;
		fullName: string;
		memberCode: string | null;
		deceasedOn: string | null;
	} & HouseholdBranch,
	relation: Relation,
	scope: AccessibleBranches,
	households: HouseholdBranch[]
): Relative {
	return {
		id: p.id,
		fullName: p.fullName,
		memberCode: p.memberCode,
		relation,
		deceased: p.deceasedOn !== null,
		linkable: viewAccess(p, scope, households) !== null
	};
}

function toProfile(profile: Detail['profile']) {
	if (!profile) return null;
	const dated = (on: boolean, date: string | null, church: string | null) =>
		on ? { date: date!, church: church! } : null;
	return {
		occupation: profile.occupation,
		education: profile.education,
		previousChurch: profile.previousChurch,
		baptism: dated(profile.baptized, profile.baptismDate, profile.baptismChurch),
		sidi: dated(profile.sidi, profile.sidiDate, profile.sidiChurch)
	};
}

function toPerson(d: Detail) {
	const p = d.person;
	return {
		id: p.id,
		memberCode: p.memberCode,
		isMember: p.isMember,
		fullName: p.fullName,
		nickname: p.nickname,
		chineseName: p.chineseName,
		sex: p.sex,
		birthDate: p.birthDate,
		birthCity: d.birthCity,
		nikMasked: p.nikEncrypted ? maskNik(decryptNik(p.nikEncrypted)) : null,
		address: { line: p.addressLine, postalCode: p.postalCode, city: d.city, region: d.region },
		homeBranch: d.homeBranch,
		deceasedOn: p.deceasedOn
	};
}

async function loadFamily(d: Detail) {
	const p = d.person;
	const [household, links] = await Promise.all([
		repo.householdPeople(p.householdId, p.id),
		repo.relationshipsOf(p.id)
	]);
	// A divorce or death of a spouse ends the marriage; it is history, not current family.
	const live = links.filter((l) => l.endedOn === null);
	const ids = [p.householdId, ...live.map((l) => l.householdId)];
	const households = await repo.householdBranchIds([...new Set(ids)]);
	return { household, live, households };
}

function groupFamily(
	d: Detail,
	f: Awaited<ReturnType<typeof loadFamily>>,
	scope: AccessibleBranches
) {
	const id = d.person.id;
	const relationTo = new Map(f.live.map((l) => [l.id, relationOf(l, id)]));
	return {
		household: f.household.map((h) =>
			toRelative(h, relationTo.get(h.id) ?? 'household', scope, f.households)
		),
		outside: f.live
			.filter((l) => l.householdId !== d.person.householdId)
			.map((l) => toRelative(l, relationOf(l, id), scope, f.households))
	};
}

export async function getMember(id: string) {
	if (!z.uuid().safeParse(id).success) throw new NotFoundError('Person', id);
	const scope = memberScope();
	const d = await repo.findPersonDetail(id);
	if (!d) throw new NotFoundError('Person', id);
	const family = await loadFamily(d);
	const access = viewAccess(d.person, scope, family.households);
	// 404, not 403: the URL must not confirm the person exists.
	if (!access) throw new NotFoundError('Person', id);
	if (access === 'cross') {
		await db.transaction((tx) =>
			recordAudit(tx, {
				action: 'person.viewed_cross_branch',
				entityType: 'person',
				entityId: id,
				branchId: d.person.homeBranchId
			})
		);
	}
	return {
		access,
		treeEnabled: await getSetting('membership.family_tree_enabled'),
		person: toPerson(d),
		profile: toProfile(d.profile),
		login:
			d.email || d.phone
				? { email: d.email, phone: d.phone, activated: d.activatedAt !== null }
				: null,
		family: groupFamily(d, family, scope)
	};
}

export type MemberRecord = Awaited<ReturnType<typeof getMember>>;
