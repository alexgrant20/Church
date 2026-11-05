import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/server/db/client';
import { personRelationships } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makePerson } from '$lib/server/db/test/factories';
import { connectedPersonIds, treeLinks } from './tree-repository';

type Row = typeof personRelationships.$inferInsert;
const parent = (p: { id: string }, c: { id: string }, extra: Partial<Row> = {}): Row => ({
	kind: 'parent',
	personId: p.id,
	relatedPersonId: c.id,
	...extra
});
const spouse = (a: { id: string }, b: { id: string }): Row => {
	const [x, y] = [a.id, b.id].sort();
	return { kind: 'spouse', personId: x, relatedPersonId: y };
};
const people = (n: number) => Promise.all(Array.from({ length: n }, () => makePerson()));
const link = (rows: Row[]) => db.insert(personRelationships).values(rows);

describe('tree repository', () => {
	beforeEach(resetDb);

	it('walks parents, children and spouses across households', async () => {
		const [grandma, father, mother, child, grandpa, uncle] = await people(6);
		await link([
			parent(grandma, father),
			spouse(father, mother),
			parent(father, child),
			parent(grandpa, mother),
			parent(grandpa, uncle)
		]);
		const ids = await connectedPersonIds(child.id, 200);
		expect(ids[0]).toBe(child.id);
		expect(new Set(ids)).toEqual(
			new Set([grandma, father, mother, child, grandpa, uncle].map((p) => p.id))
		);
	});

	it('returns only the root when there are no links', async () => {
		const [a] = await people(1);
		expect(await connectedPersonIds(a.id, 200)).toEqual([a.id]);
	});

	it('terminates on a cycle', async () => {
		const [a, b] = await people(2);
		await link([parent(a, b), parent(b, a)]);
		const ids = await connectedPersonIds(a.id, 200);
		expect(ids[0]).toBe(a.id);
		expect(new Set(ids)).toEqual(new Set([a.id, b.id]));
		expect(ids).toHaveLength(2);
	});

	it('does not follow a soft-deleted relationship', async () => {
		const [a, b, c] = await people(3);
		await link([parent(a, b), parent(b, c, { deletedAt: new Date() })]);
		expect(await connectedPersonIds(a.id, 200)).toEqual([a.id, b.id]);
	});

	it('a soft-deleted person cuts the chain', async () => {
		const [a, c] = await people(2);
		const b = await makePerson({ deletedAt: new Date() });
		await link([parent(a, b), parent(b, c)]);
		expect(await connectedPersonIds(a.id, 200)).toEqual([a.id]);
	});

	it('stops at the limit, nearest first', async () => {
		const chain = await people(6);
		await link(chain.slice(1).map((p, i) => parent(chain[i], p)));
		expect(await connectedPersonIds(chain[0].id, 3)).toEqual(chain.slice(0, 3).map((p) => p.id));
	});

	it('returns links only between the given people, skipping deleted rows', async () => {
		const [a, b, c, d] = await people(4);
		await link([parent(a, b), parent(b, c), parent(a, d, { deletedAt: new Date() })]);
		const links = await treeLinks([a.id, b.id, d.id]);
		expect(links).toEqual([
			{ kind: 'parent', personId: a.id, relatedPersonId: b.id, endedOn: null }
		]);
	});
});
